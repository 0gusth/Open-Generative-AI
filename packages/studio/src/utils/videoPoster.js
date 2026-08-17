// Generated clips routinely open on a pure-black frame (cinematic fade-in),
// which makes a thumbnail card look broken. Once metadata is in, seek a hair
// into the clip so the card shows a real image. Verified live: seeking is
// what turns the black grid into visible thumbnails.
export function seekPosterFrame(event) {
    const video = event.currentTarget;
    if (video.currentTime === 0 && Number.isFinite(video.duration) && video.duration > 0) {
        // 25% into the clip, capped at 3s — 1s was still inside the longer
        // fade-ins and left those cards black.
        video.currentTime = Math.min(3, video.duration * 0.25);
    }
}
