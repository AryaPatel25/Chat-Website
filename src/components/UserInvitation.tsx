import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { UserPlus, Search, Mail, Users } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface User {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  status: string | null;
}

interface RoomMember {
  id: string;
  user_id: string;
  room_id: string;
  role: 'admin' | 'member';
  joined_at: string;
}

interface UserInvitationProps {
  roomId: string;
  roomName: string;
  isPrivate: boolean;
  onMemberAdded?: () => void;
}

const UserInvitation: React.FC<UserInvitationProps> = ({ roomId, roomName, isPrivate, onMemberAdded }) => {
  const { user } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [roomMembers, setRoomMembers] = useState<RoomMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [inviting, setInviting] = useState<string | null>(null);

  useEffect(() => {
    if (isDialogOpen) {
      fetchRoomMembers();
      if (searchQuery) {
        searchUsers();
      }
    }
  }, [isDialogOpen, searchQuery]);

  const fetchRoomMembers = async () => {
    const { data, error } = await supabase
      .from('room_members')
      .select('*')
      .eq('room_id', roomId);

    if (!error) {
      setRoomMembers(data || []);
    }
  };

  const searchUsers = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setLoading(true);
    
    // Search users by username or display name
    const { data, error } = await supabase
      .from('profiles')
      .select('user_id, username, display_name, avatar_url, status')
      .or(`username.ilike.%${searchQuery}%,display_name.ilike.%${searchQuery}%`)
      .neq('user_id', user?.id) // Exclude current user
      .limit(10);

    if (error) {
      toast({
        title: "Search failed",
        description: error.message,
        variant: "destructive"
      });
    } else {
      // Filter out users who are already members
      const memberIds = roomMembers.map(m => m.user_id);
      const filteredResults = (data || []).filter(u => !memberIds.includes(u.user_id));
      setSearchResults(filteredResults);
    }
    setLoading(false);
  };

  const inviteUser = async (userId: string, username: string) => {
    setInviting(userId);
    
    const { error } = await supabase
      .from('invitations')
      .insert({
        room_id: roomId,
        invited_by: user?.id,
        invited_user: userId,
        status: 'pending',
        message: `You've been invited to join "${roomName}"`
      });

    if (error) {
      toast({
        title: "Failed to send invitation",
        description: error.message,
        variant: "destructive"
      });
    } else {
      toast({
        title: "Invitation sent!",
        description: `${username} has been invited to join the room`
      });
      
      // Add to room members immediately if it's a public room
      if (!isPrivate) {
        await addUserToRoom(userId);
      }
    }
    setInviting(null);
  };

  const addUserToRoom = async (userId: string) => {
    const { error } = await supabase
      .from('room_members')
      .insert({
        room_id: roomId,
        user_id: userId,
        role: 'member',
        joined_at: new Date().toISOString()
      });

    if (!error) {
      fetchRoomMembers();
      onMemberAdded?.();
    }
  };

  const removeMember = async (userId: string) => {
    const { error } = await supabase
      .from('room_members')
      .delete()
      .eq('room_id', roomId)
      .eq('user_id', userId);

    if (error) {
      toast({
        title: "Failed to remove member",
        description: error.message,
        variant: "destructive"
      });
    } else {
      fetchRoomMembers();
      toast({
        title: "Member removed",
        description: "User has been removed from the room"
      });
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="p-2">
          <UserPlus className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Users className="w-5 h-5" />
            <span>Manage Room Members</span>
          </DialogTitle>
          <DialogDescription>
            Invite users to join "{roomName}" or manage existing members
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current Members */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Current Members ({roomMembers.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-32">
                <div className="space-y-2">
                  {roomMembers.map((member) => (
                    <div key={member.id} className="flex items-center justify-between p-2 border rounded">
                      <div className="flex items-center space-x-3">
                        <Avatar className="w-8 h-8">
                          <AvatarFallback className="text-xs">
                            {getInitials(member.user_id)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium">{member.user_id}</p>
                          <Badge variant={member.role === 'admin' ? 'default' : 'secondary'} className="text-xs">
                            {member.role}
                          </Badge>
                        </div>
                      </div>
                      {member.role === 'member' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeMember(member.user_id)}
                          className="text-red-500 hover:text-red-700"
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  ))}
                  {roomMembers.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No members yet
                    </p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* User Search */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Invite New Users</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex space-x-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    placeholder="Search users by username or name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              {searchResults.length > 0 && (
                <ScrollArea className="h-48">
                  <div className="space-y-2">
                    {searchResults.map((searchUser) => (
                      <div key={searchUser.user_id} className="flex items-center justify-between p-3 border rounded">
                        <div className="flex items-center space-x-3">
                          <Avatar className="w-10 h-10">
                            <AvatarImage src={searchUser.avatar_url} />
                            <AvatarFallback>
                              {getInitials(searchUser.display_name || searchUser.username)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{searchUser.display_name || searchUser.username}</p>
                            <p className="text-sm text-muted-foreground">@{searchUser.username}</p>
                            <div className="flex items-center space-x-1">
                              <div className={`w-2 h-2 rounded-full ${
                                searchUser.status === 'online' ? 'bg-green-500' : 'bg-gray-400'
                              }`}></div>
                              <span className="text-xs text-muted-foreground">
                                {searchUser.status === 'online' ? 'Online' : 'Offline'}
                              </span>
                            </div>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => inviteUser(searchUser.user_id, searchUser.username)}
                          disabled={inviting === searchUser.user_id}
                          className="flex items-center space-x-1"
                        >
                          <Mail className="w-3 h-3" />
                          <span>{inviting === searchUser.user_id ? 'Inviting...' : 'Invite'}</span>
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}

              {searchQuery && searchResults.length === 0 && !loading && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No users found matching "{searchQuery}"
                </p>
              )}

              {loading && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Searching users...
                </p>
              )}
            </CardContent>
          </Card>

          {/* Room Type Info */}
          <Card className="bg-muted/50">
            <CardContent className="pt-4">
              <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                <div className={`w-2 h-2 rounded-full ${isPrivate ? 'bg-red-500' : 'bg-green-500'}`}></div>
                <span>
                  {isPrivate 
                    ? 'Private room - Users need invitations to join' 
                    : 'Public room - Users can join directly'
                  }
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UserInvitation;
