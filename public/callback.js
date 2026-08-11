// Callback for the web-app login flow. Web /login?return=extension&ext_id=…
      // redirects to chrome-extension://<id>/callback.html?token=…&refresh=…
      // once auth succeeds. We route through the same LOGIN_WITH_TOKEN message
      // the popup uses, so SignalUploader + InboxPoller wake immediately.
      (async function () {
        const statusEl = document.getElementById('status');
        const spinnerEl = document.getElementById('spinner');

        try {
          const params = new URLSearchParams(window.location.search);
          const token = params.get('token');
          const refresh = params.get('refresh');

          if (!token || !refresh) {
            throw new Error('No authentication tokens received');
          }

          // Best-effort profile fetch so the popup can render "Signed in as
          // foo@bar.com" without a roundtrip. Non-critical.
          let user;
          try {
            const cloudUrl =
              (await chrome.storage.local.get('recome_cloud_url')).recome_cloud_url ||
              'https://recome-api.fly.dev';
            const res = await fetch(cloudUrl + '/user/profile', {
              headers: { Authorization: 'Bearer ' + token },
            });
            if (res.ok) {
              const profile = await res.json();
              user = { id: profile.id, email: profile.email };
            }
          } catch (e) {
            console.warn('profile fetch failed (non-critical):', e);
          }

          // Route through background's LOGIN_WITH_TOKEN handler so tokens land
          // via shared/AuthClient.storeTokens() and the queue + poller fire.
          chrome.runtime.sendMessage(
            {
              type: 'LOGIN_WITH_TOKEN',
              payload: { accessToken: token, refreshToken: refresh, user },
            },
            () => {
              // Fallback: write directly to storage if the background message
              // didn't reach a listener (shouldn't happen, but harmless).
              if (chrome.runtime.lastError) {
                chrome.storage.local.set({
                  recome_access_token: token,
                  recome_refresh_token: refresh,
                  ...(user ? { recome_user: user } : {}),
                });
              }
            },
          );

          spinnerEl.style.display = 'none';
          statusEl.innerHTML =
            '<span class="success">Signed in successfully!</span><br>' +
            '<small style="color:rgba(255,255,255,0.4)">You can close this tab.</small>';
          setTimeout(() => window.close(), 1800);
        } catch (err) {
          spinnerEl.style.display = 'none';
          statusEl.innerHTML =
            '<span class="error">Sign-in failed: ' +
            (err.message || 'Unknown error') +
            '</span>';
        }
      })();
