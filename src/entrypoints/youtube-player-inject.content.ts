import { defineContentScript } from '#imports';

export default defineContentScript({
  matches: [
    '*://*.youtube.com/*',
    '*://music.youtube.com/*',
  ],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    function updatePlayerResponse() {
      try {
        const moviePlayer = document.getElementById('movie_player') as any;
        const response = moviePlayer?.getPlayerResponse?.() || (window as any).ytInitialPlayerResponse;
        if (response) {
          document.documentElement.setAttribute('data-yt-player-response', JSON.stringify({
            videoDetails: {
              categoryId: response.videoDetails?.categoryId,
              lengthSeconds: response.videoDetails?.lengthSeconds,
              title: response.videoDetails?.title,
              author: response.videoDetails?.author,
              channelId: response.videoDetails?.channelId,
              videoId: response.videoDetails?.videoId,
            },
            captions: response.captions ? {
              playerCaptionsTracklistRenderer: {
                captionTracks: response.captions.playerCaptionsTracklistRenderer?.captionTracks?.map((t: any) => ({
                  languageCode: t.languageCode
                }))
              }
            } : undefined
          }));
        }
      } catch (e) {
        console.error('[NAT] Failed to update player response:', e);
      }
    }

    // Update on page navigation events
    window.addEventListener('yt-navigate-finish', () => {
      // Small timeout increments to capture updates as the player loads new videos
      setTimeout(updatePlayerResponse, 300);
      setTimeout(updatePlayerResponse, 800);
      setTimeout(updatePlayerResponse, 1500);
    });

    // Support synchronous requests from isolated content scripts
    window.addEventListener('nat-request-player-response', updatePlayerResponse);
    
    // Initial bootstrap call
    setTimeout(updatePlayerResponse, 800);
  }
});
