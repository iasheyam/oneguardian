import { useState, useEffect } from 'react'
import { apiUrl, getToken } from '../utils/api'

export function useLivePositions() {
  const [positions, setPositions] = useState({}) // traccarDeviceId → position

  useEffect(() => {
    const token = getToken()
    const url   = token
      ? apiUrl(`/api/live?token=${encodeURIComponent(token)}`)
      : apiUrl('/api/live')

    const es = new EventSource(url)

    es.onmessage = e => {
      try {
        const msg = JSON.parse(e.data)

        if (msg.type === 'snapshot') {
          setPositions(msg.positions)
        }

        if (msg.type === 'positions') {
          setPositions(prev => {
            const next = { ...prev }
            for (const pos of msg.positions) {
              next[pos.deviceId] = pos
            }
            return next
          })
        }
      } catch {}
    }

    es.onerror = () => es.close()

    return () => es.close()
  }, [])

  return positions
}
