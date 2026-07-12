import { useState, useEffect } from 'react'
import { apiUrl } from '../utils/api'

export function useLivePositions() {
  const [positions, setPositions] = useState({}) // traccarDeviceId → position

  useEffect(() => {
    const es = new EventSource(apiUrl('/api/live'))

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
