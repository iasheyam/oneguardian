import { useNavigate } from 'react-router-dom'

export default function BackButton({ label = '← BACK', className = 'ud-back' }) {
  const navigate = useNavigate()
  return (
    <button className={className} onClick={() => navigate(-1)}>
      {label}
    </button>
  )
}
