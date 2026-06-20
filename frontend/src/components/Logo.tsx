interface LogoProps {
  className?: string
  size?: number
}

export default function Logo({ className = '', size = 24 }: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* ♂ symbol */}
      <circle cx="10" cy="10" r="6" />
      <line x1="14.5" y1="14.5" x2="20" y2="20" />
      <line x1="16" y1="20" x2="20" y2="20" />
      <line x1="20" y1="16" x2="20" y2="20" />
    </svg>
  )
}
