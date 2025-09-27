import React, { useState } from 'react';
import ChatRoomSelector from './ChatRoomSelector';
import ChatRoom from './ChatRoom';
import InvitationNotification from './InvitationNotification';
import { useAuth } from '@/hooks/useAuth';

const ChatLayout: React.FC = () => {
  const { user } = useAuth();
  const [currentRoomId, setCurrentRoomId] = useState('00000000-0000-0000-0000-000000000001'); // Default room
  const [isRoomChanging, setIsRoomChanging] = useState(false);

  const handleRoomSelect = (roomId: string) => {
    if (roomId !== currentRoomId) {
      setIsRoomChanging(true);
      setCurrentRoomId(roomId);
      // Reset loading state after a short delay
      setTimeout(() => setIsRoomChanging(false), 500);
    }
  };

  return (
    <div className="flex h-screen bg-background">
      <ChatRoomSelector 
        currentRoomId={currentRoomId} 
        onRoomSelect={handleRoomSelect} 
      />
      <div className="flex-1 flex flex-col">
        <div className="relative">
          <ChatRoom roomId={currentRoomId} />
          {/* Invitation Notifications */}
          <div className="absolute top-4 right-4 z-50">
            <InvitationNotification />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatLayout;
