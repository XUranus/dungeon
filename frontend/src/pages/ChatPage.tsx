import { useParams } from 'react-router-dom'
import ChatPanel from '../components/chat/ChatPanel'

export default function ChatPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  return (
    <div className="h-full">
      <ChatPanel initialSessionId={sessionId ?? null} />
    </div>
  )
}
