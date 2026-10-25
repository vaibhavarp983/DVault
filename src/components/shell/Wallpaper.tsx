export function Wallpaper() {
  return (
    <div className="wallpaper absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute -right-[8%] -top-[28%] size-[900px] rounded-full bg-gold/20 blur-[130px]" />
      <div className="absolute -left-[10%] top-[42%] size-[560px] rounded-full bg-[#6d5326]/30 blur-[120px]" />

      <svg
        viewBox="0 0 1600 1000"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 size-full opacity-70"
      >
        <defs>
          <linearGradient id="wall-ring" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#F0CD8B" stopOpacity="0.55" />
            <stop offset="0.55" stopColor="#C49A4A" stopOpacity="0.12" />
            <stop offset="1" stopColor="#C49A4A" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="wall-ribbon" x1="0" y1="0" x2="1" y2="0">
            <stop stopColor="#F4D79E" stopOpacity="0" />
            <stop offset="0.5" stopColor="#F4D79E" stopOpacity="0.35" />
            <stop offset="1" stopColor="#F4D79E" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="wall-core" cx="0.5" cy="0.5" r="0.5">
            <stop stopColor="#F1C97F" stopOpacity="0.3" />
            <stop offset="1" stopColor="#F1C97F" stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle cx="1160" cy="380" r="420" fill="url(#wall-core)" />
        <circle cx="1160" cy="380" r="300" fill="none" stroke="url(#wall-ring)" strokeWidth="1.2" />
        <circle cx="1160" cy="380" r="380" fill="none" stroke="url(#wall-ring)" strokeWidth="0.9" />
        <circle cx="1160" cy="380" r="470" fill="none" stroke="url(#wall-ring)" strokeWidth="0.7" />
        <circle cx="1160" cy="380" r="570" fill="none" stroke="url(#wall-ring)" strokeWidth="0.5" />

        <path
          d="M-80 820C220 690 380 760 620 660c260-108 420-240 760-220 160 9 300 64 420 128"
          fill="none"
          stroke="url(#wall-ribbon)"
          strokeWidth="1.4"
        />
        <path
          d="M-120 700c310-140 470-70 710-170 260-108 430-220 780-196 150 10 290 60 410 124"
          fill="none"
          stroke="url(#wall-ribbon)"
          strokeWidth="0.8"
          opacity="0.7"
        />
      </svg>

      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(10,9,7,0.55)_100%)]" />

      <div className="absolute bottom-[104px] right-9 hidden select-none text-right md:block">
        <p className="text-[42px] font-semibold leading-none tracking-[-0.04em] text-white/[0.07]">
          DVault
        </p>
        <p className="mt-2 text-[11px] font-medium tracking-[0.02em] text-white/30">
          Synthetic demo workspace · double-click an icon to begin
        </p>
      </div>
    </div>
  )
}
