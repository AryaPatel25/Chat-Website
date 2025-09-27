import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Hash, Lock, Users } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface ChatRoom {
  id: string;
  name: string;
  description: string | null;
  is_private: boolean | null;
  created_by: string | null;
  created_at: string;
}

interface ChatRoomSelectorProps {
  currentRoomId: string;
  onRoomSelect: (roomId: string) => void;
}

const ChatRoomSelector: React.FC<ChatRoomSelectorProps> = ({ currentRoomId, onRoomSelect }) => {
  const { user } = useAuth();
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomDescription, setNewRoomDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);

  useEffect(() => {
    fetchRooms();
  }, []);

  const fetchRooms = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('chat_rooms')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast({
        title: "Error loading rooms",
        description: error.message,
        variant: "destructive"
      });
    } else {
      // If no rooms exist, create default rooms
      if (!data || data.length === 0) {
        await createDefaultRooms();
      } else {
        setRooms(data);
      }
    }
    setLoading(false);
  };

  const createDefaultRooms = async () => {
    if (!user) return;

    const defaultRooms = [
      {
        id: '00000000-0000-0000-0000-000000000001',
        name: 'General',
        description: 'Welcome to the general chat room!',
        is_private: false,
        created_by: user.id
      },
      {
        id: '00000000-0000-0000-0000-000000000002',
        name: 'College',
        description: 'College discussion room',
        is_private: false,
        created_by: user.id
      }
    ];

    const { data, error } = await supabase
      .from('chat_rooms')
      .insert(defaultRooms)
      .select();

    if (error) {
      toast({
        title: "Failed to create default rooms",
        description: error.message,
        variant: "destructive"
      });
    } else {
      setRooms(data || []);
      
      // Manually add user as admin to the rooms
      const roomIds = data?.map(room => room.id) || [];
      for (const roomId of roomIds) {
        await supabase
          .from('room_members')
          .insert({
            room_id: roomId,
            user_id: user.id,
            role: 'admin',
            joined_at: new Date().toISOString()
          })
          .catch(err => console.log('Room member creation failed:', err.message));
      }
      
      toast({
        title: "Default rooms created",
        description: "General and College rooms have been created"
      });
    }
  };

  const createRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim() || !user) return;

    setLoading(true);
    const { data, error } = await supabase
      .from('chat_rooms')
      .insert({
        name: newRoomName.trim(),
        description: newRoomDescription.trim() || null,
        is_private: isPrivate,
        created_by: user.id
      })
      .select()
      .single();

    if (error) {
      toast({
        title: "Error creating room",
        description: error.message,
        variant: "destructive"
      });
    } else {
      toast({
        title: "Room created successfully",
        description: `${newRoomName} has been created`
      });
      setRooms(prev => [data, ...prev]);
      setNewRoomName('');
      setNewRoomDescription('');
      setIsPrivate(false);
      setIsCreateDialogOpen(false);
      onRoomSelect(data.id);
    }
    setLoading(false);
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleDateString();
  };

  return (
    <div className="w-64 bg-card border-r border-border flex flex-col">
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Chat Rooms</h2>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus className="w-4 h-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Room</DialogTitle>
                <DialogDescription>
                  Create a new chat room for your conversations
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={createRoom} className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Room Name</label>
                  <Input
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    placeholder="Enter room name"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Description (Optional)</label>
                  <Input
                    value={newRoomDescription}
                    onChange={(e) => setNewRoomDescription(e.target.value)}
                    placeholder="Enter room description"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="private"
                    checked={isPrivate}
                    onChange={(e) => setIsPrivate(e.target.checked)}
                    className="rounded"
                  />
                  <label htmlFor="private" className="text-sm font-medium">
                    Private Room
                  </label>
                </div>
                <div className="flex justify-end space-x-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsCreateDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={loading}>
                    Create Room
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center text-muted-foreground">
            Loading rooms...
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {rooms.map((room) => (
              <Card
                key={room.id}
                className={`cursor-pointer transition-colors ${
                  currentRoomId === room.id 
                    ? 'bg-primary text-primary-foreground' 
                    : 'hover:bg-muted'
                }`}
                onClick={() => onRoomSelect(room.id)}
              >
                <CardContent className="p-3">
                  <div className="flex items-center space-x-2">
                    {room.is_private ? (
                      <Lock className="w-4 h-4" />
                    ) : (
                      <Hash className="w-4 h-4" />
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium truncate">{room.name}</h3>
                      {room.description && (
                        <p className="text-xs opacity-75 truncate">{room.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <Badge variant="secondary" className="text-xs">
                      {formatTime(room.created_at)}
                    </Badge>
                    <div className="flex items-center space-x-1 text-xs opacity-75">
                      <Users className="w-3 h-3" />
                      <span>0</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatRoomSelector;
