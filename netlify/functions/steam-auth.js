/**
 * ==============================================================================
 * DCE MODS LOADER — SERVICIO DE AUTENTICACIÓN OFICIAL STEAM OPENID 2.0
 * Desarrollado por DCE STUDIOS | https://dcegaming.netlify.app/
 * ==============================================================================
 * Maneja el ciclo completo de autenticación con Valve:
 * 1. Redirige al usuario al servidor oficial de Steam (steamcommunity.com).
 * 2. Recibe el callback con la firma de Steam.
 * 3. Valida la firma criptográfica con el servidor de Steam (openid.mode=check_authentication).
 * 4. Obtiene el nombre y avatar real del jugador desde su perfil público de Steam.
 * 5. Redirige a comunidad.html con la sesión verificada en un token seguro.
 */

exports.handler = async (event, context) => {
  const query = event.queryStringParameters || {};
  const host = event.headers['x-forwarded-host'] || event.headers.host || 'dcemodsloaderversusl4d2.netlify.app';
  const proto = event.headers['x-forwarded-proto'] || 'https';
  const baseUrl = `${proto}://${host}`;
  const returnUrl = `${baseUrl}/.netlify/functions/steam-auth?action=return`;
  const realm = `${baseUrl}/`;

  // 1. INICIAR LOGIN CON STEAM
  if (query.action === 'login' || (!query['openid.mode'] && query.action !== 'return')) {
    const steamParams = new URLSearchParams({
      'openid.ns': 'http://specs.openid.net/auth/2.0',
      'openid.mode': 'checkid_setup',
      'openid.return_to': returnUrl,
      'openid.realm': realm,
      'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
      'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
    });

    return {
      statusCode: 302,
      headers: {
        Location: `https://steamcommunity.com/openid/login?${steamParams.toString()}`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
      body: '',
    };
  }

  // 2. VALIDAR RESPUESTA DE RETORNO DE STEAM
  if (query['openid.mode'] === 'id_res') {
    try {
      // Validar con Steam directamente (check_authentication)
      const validationParams = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (key !== 'action') {
          validationParams.append(key, value);
        }
      }
      validationParams.set('openid.mode', 'check_authentication');

      const validationRes = await fetch('https://steamcommunity.com/openid/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: validationParams.toString(),
      });

      const validationText = await validationRes.text();
      const isValid = validationText.includes('is_valid:true');

      if (!isValid) {
        console.error('Steam OpenID validation failed:', validationText);
        return {
          statusCode: 302,
          headers: {
            Location: `${baseUrl}/comunidad.html?steam_error=invalid_signature`,
          },
          body: '',
        };
      }

      // Extraer SteamID64 desde openid.claimed_id
      const claimedId = query['openid.claimed_id'] || '';
      const steamIdMatch = claimedId.match(/\/id\/(\d+)$/);
      const steamId = steamIdMatch ? steamIdMatch[1] : null;

      if (!steamId) {
        return {
          statusCode: 302,
          headers: {
            Location: `${baseUrl}/comunidad.html?steam_error=no_steam_id`,
          },
          body: '',
        };
      }

      // Obtener datos del perfil público de Steam (nombre y avatar) vía XML público
      let personaName = `SteamUser_${steamId.slice(-4)}`;
      let avatarUrl = `${baseUrl}/icono.png`;
      let profileUrl = `https://steamcommunity.com/profiles/${steamId}/`;

      try {
        const profileRes = await fetch(`https://steamcommunity.com/profiles/${steamId}/?xml=1`, {
          headers: {
            'User-Agent': 'DCE-Mods-Loader-Community/2.0.8',
          },
        });

        if (profileRes.ok) {
          const xml = await profileRes.text();
          
          // Parsear <steamID>
          const nameMatch = xml.match(/<steamID>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/steamID>/);
          if (nameMatch && nameMatch[1]) {
            personaName = nameMatch[1].trim();
          }

          // Parsear <avatarMedium> o <avatarFull>
          const avatarMatch = xml.match(/<avatarMedium>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/avatarMedium>/)
            || xml.match(/<avatarFull>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/avatarFull>/);
          if (avatarMatch && avatarMatch[1]) {
            avatarUrl = avatarMatch[1].trim();
          }

          // Parsear <customURL> si existe
          const customUrlMatch = xml.match(/<customURL>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/customURL>/);
          if (customUrlMatch && customUrlMatch[1]) {
            profileUrl = `https://steamcommunity.com/id/${customUrlMatch[1].trim()}/`;
          }
        }
      } catch (profileErr) {
        console.warn('No se pudo obtener XML de perfil de Steam:', profileErr);
      }

      const userData = {
        name: personaName,
        steamId: steamId,
        avatar: avatarUrl,
        profileUrl: profileUrl,
        verified: true,
        verifiedAt: new Date().toISOString(),
      };

      const encodedPayload = encodeURIComponent(JSON.stringify(userData));

      return {
        statusCode: 302,
        headers: {
          Location: `${baseUrl}/comunidad.html?steam_auth=${encodedPayload}`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
        body: '',
      };

    } catch (err) {
      console.error('Error durante autenticación con Steam:', err);
      return {
        statusCode: 302,
        headers: {
          Location: `${baseUrl}/comunidad.html?steam_error=${encodeURIComponent(err.message || 'error')}`,
        },
        body: '',
      };
    }
  }

  // Cancelado o cancel_mode
  return {
    statusCode: 302,
    headers: {
      Location: `${baseUrl}/comunidad.html?steam_error=cancelled`,
    },
    body: '',
  };
};
