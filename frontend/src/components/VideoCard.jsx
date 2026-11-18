export default function VideoCard({ video, startAt, autoplay }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <img
          src={`https://img.youtube.com/vi/${video.video_id}/mqdefault.jpg`}
          alt=""
          className="h-14 w-24 rounded-lg object-cover"
        />
        <div className="min-w-0">
          <h2 className="line-clamp-2 text-sm font-medium">{video.title || "YouTube video"}</h2>
          <p className="mt-0.5 text-xs text-green-400">✓ Transcript ready</p>
        </div>
      </div>

      <div className="aspect-video overflow-hidden rounded-2xl border border-neutral-800">
        <iframe
          key={`${video.video_id}-${startAt}`}
          className="h-full w-full"
          src={`https://www.youtube.com/embed/${video.video_id}?start=${startAt}&autoplay=${autoplay ? 1 : 0}`}
          title="YouTube video"
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      </div>
    </div>
  );
}
