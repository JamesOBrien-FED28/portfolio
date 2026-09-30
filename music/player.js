document.addEventListener('DOMContentLoaded', () => {
    const player = document.getElementById('main-audio');
    const source = document.getElementById('audio-source');
    const title = document.getElementById('now-playing-title');
    let currentBtn = null;

    // Global helper called by onclick handlers
    window.playTrack = function (filePath, trackTitle, buttonElement) {
        if (!player || !source || !title) return;

        source.src = filePath;
        title.innerText = trackTitle;

        if (currentBtn) {
            currentBtn.classList.remove('active-track');
        }

        buttonElement.classList.add('active-track');
        currentBtn = buttonElement;

        player.load();
        player.play();
    };

    // Auto-advance to next song when current track ends
    if (player) {
        player.addEventListener('ended', () => {
            if (currentBtn && currentBtn.nextElementSibling) {
                currentBtn.nextElementSibling.click();
            }
        });
    }
});