import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Send, LogOut, Users, Smile, Paperclip, Mic, MicOff, Edit2, Check, X } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import ThemeToggle from './ThemeToggle';
import MiniGame from './MiniGame';
import UserInvitation from './UserInvitation';

interface Message {
  id: string;
  content: string;
  user_id: string;
  created_at: string;
  edited_at?: string | null;
  message_type?: string;
  reactions?: Record<string, string[]>;
  profiles?: {
    username: string;
    display_name: string;
    avatar_url?: string;
  };
}

interface Profile {
  user_id: string;
  username: string;
  display_name: string;
  status: string;
  avatar_url?: string;
}

interface ChatRoomProps {
  roomId?: string;
}

const ChatRoom: React.FC<ChatRoomProps> = ({ roomId = '00000000-0000-0000-0000-000000000001' }) => {
  const { user, signOut } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [onlineUsers, setOnlineUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [roomInfo, setRoomInfo] = useState<{ name: string; isPrivate: boolean } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Handle typing indicators
  const handleTyping = () => {
    if (!user || !newMessage.trim()) return;
    
    if (!isTyping) {
      setIsTyping(true);
      supabase
        .from('typing_indicators')
        .insert({
          user_id: user.id,
          room_id: roomId
        });
    }

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set new timeout to stop typing indicator
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      supabase
        .from('typing_indicators')
        .delete()
        .eq('user_id', user.id)
        .eq('room_id', roomId);
    }, 1000);
  };

  // Voice recording functionality
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setIsRecording(true);
      // Voice recording implementation would go here
    } catch (error) {
      toast({
        title: "Microphone access denied",
        description: "Please allow microphone access to record voice messages",
        variant: "destructive"
      });
    }
  };

  const stopRecording = () => {
    setIsRecording(false);
    // Stop recording implementation would go here
  };

  // Handle message reactions
  const addReaction = async (messageId: string, emoji: string) => {
    if (!user) return;

    const { data: message } = await supabase
      .from('messages')
      .select('reactions')
      .eq('id', messageId)
      .single();

    if (!message) return;

    const currentReactions = (message.reactions as Record<string, string[]>) || {};
    const reactionUsers = currentReactions[emoji] || [];
    
    if (reactionUsers.includes(user.id)) {
      // Remove reaction
      const updatedUsers = reactionUsers.filter(id => id !== user.id);
      const updatedReactions = { ...currentReactions };
      
      if (updatedUsers.length === 0) {
        delete updatedReactions[emoji];
      } else {
        updatedReactions[emoji] = updatedUsers;
      }

      await supabase
        .from('messages')
        .update({ reactions: updatedReactions })
        .eq('id', messageId);
    } else {
      // Add reaction
      const updatedReactions = {
        ...currentReactions,
        [emoji]: [...reactionUsers, user.id]
      };

      await supabase
        .from('messages')
        .update({ reactions: updatedReactions })
        .eq('id', messageId);
    }
  };

  // Handle message editing
  const startEditing = (messageId: string, currentContent: string) => {
    setEditingMessageId(messageId);
    setEditContent(currentContent);
  };

  const cancelEditing = () => {
    setEditingMessageId(null);
    setEditContent('');
  };

  const saveEdit = async () => {
    if (!editingMessageId || !editContent.trim()) return;

    const { error } = await supabase
      .from('messages')
      .update({
        content: editContent.trim(),
        edited_at: new Date().toISOString()
      })
      .eq('id', editingMessageId);

    if (error) {
      toast({
        title: "Failed to edit message",
        description: error.message,
        variant: "destructive"
      });
    } else {
      setEditingMessageId(null);
      setEditContent('');
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Send system message for user join
  const sendSystemMessage = useCallback(async (content: string) => {
    if (!user) return;

    await supabase
      .from('messages')
      .insert({
        content,
        user_id: user.id,
        room_id: roomId,
        message_type: 'system'
      });
  }, [user, roomId]);

  // Fetch room information
  const fetchRoomInfo = async () => {
    const { data, error } = await supabase
      .from('chat_rooms')
      .select('name, is_private')
      .eq('id', roomId)
      .single();

    if (!error && data) {
      setRoomInfo({
        name: data.name,
        isPrivate: data.is_private || false
      });
    }
  };

  useEffect(() => {
    if (!user) return;

    // Clear previous messages when switching rooms
    setMessages([]);
    setRoomInfo(null);

    // Fetch room information
    fetchRoomInfo();

    // Send join notification
    sendSystemMessage(`${user.user_metadata?.display_name || user.email} joined the chat`);

    // Fetch initial messages
    const fetchMessages = async () => {
      const { data: messagesData, error: messagesError } = await supabase
        .from('messages')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true })
        .limit(50);

      if (messagesError) {
        toast({
          title: "Error loading messages",
          description: messagesError.message,
          variant: "destructive"
        });
        return;
      }

      // Fetch profiles for message authors
      const userIds = [...new Set(messagesData?.map(m => m.user_id) || [])];
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url')
        .in('user_id', userIds);

      // Combine messages with profile data
      const messagesWithProfiles = messagesData?.map(message => ({
        ...message,
        reactions: message.reactions as Record<string, string[]> || undefined,
        profiles: profilesData?.find(p => p.user_id === message.user_id) || {
          username: 'Unknown',
          display_name: 'Unknown User',
          avatar_url: null
        }
      })) || [];

      setMessages(messagesWithProfiles);
    };

    // Fetch online users
    const fetchOnlineUsers = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('status', 'online');

      if (!error) {
        setOnlineUsers(data || []);
      }
    };

    // Update user status to online
    const updateUserStatus = async () => {
      await supabase
        .from('profiles')
        .update({ status: 'online' })
        .eq('user_id', user.id);
    };

    fetchMessages();
    fetchOnlineUsers();
    updateUserStatus();

    // Set up real-time subscriptions
    const messagesChannel = supabase
      .channel('messages-channel')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages'
        },
        async (payload) => {
          const newMessage = payload.new as Message;
          
          // Fetch profile for the message author
          const { data: profile } = await supabase
            .from('profiles')
            .select('user_id, username, display_name, avatar_url')
            .eq('user_id', newMessage.user_id)
            .single();

          const messageWithProfile: Message = {
            id: newMessage.id,
            content: newMessage.content,
            user_id: newMessage.user_id,
            created_at: newMessage.created_at,
            profiles: profile ? {
              username: profile.username,
              display_name: profile.display_name,
              avatar_url: profile.avatar_url
            } : {
              username: 'Unknown',
              display_name: 'Unknown User',
              avatar_url: null
            }
          };

          setMessages(prev => [...prev, messageWithProfile]);
        }
      )
      .subscribe();

    const profilesChannel = supabase
      .channel('profiles-channel')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles'
        },
        (payload) => {
          const updatedProfile = payload.new as Profile;
          setOnlineUsers(prev => {
            if (updatedProfile.status === 'online') {
              return prev.some(u => u.user_id === updatedProfile.user_id)
                ? prev.map(u => u.user_id === updatedProfile.user_id ? updatedProfile : u)
                : [...prev, updatedProfile];
            } else {
              return prev.filter(u => u.user_id !== updatedProfile.user_id);
            }
          });
        }
      )
      .subscribe();

    // Typing indicators subscription
    const typingChannel = supabase
      .channel('typing-channel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'typing_indicators'
        },
        async (payload) => {
          if (payload.eventType === 'INSERT' && payload.new.user_id !== user?.id) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('display_name, username')
              .eq('user_id', payload.new.user_id)
              .single();
            
            if (profile) {
              setTypingUsers(prev => [...prev, profile.display_name || profile.username]);
              
              // Remove typing indicator after 3 seconds
              setTimeout(() => {
                setTypingUsers(prev => prev.filter(name => name !== (profile.display_name || profile.username)));
              }, 3000);
            }
          }
        }
      )
      .subscribe();

    // Clean up on unmount
    return () => {
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(profilesChannel);
      supabase.removeChannel(typingChannel);
      
      // Set user status to offline
      supabase
        .from('profiles')
        .update({ status: 'offline' })
        .eq('user_id', user.id);
    };
  }, [user, roomId, sendSystemMessage]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user || loading) return;

    setLoading(true);
    
    // First, ensure the room exists
    const { data: roomExists } = await supabase
      .from('chat_rooms')
      .select('id')
      .eq('id', roomId)
      .single();

    if (!roomExists) {
      // Create a default room if it doesn't exist
      const roomName = roomId === '00000000-0000-0000-0000-000000000001' ? 'General' : 
                      roomId === '00000000-0000-0000-0000-000000000002' ? 'College' : 'New Room';
      
      const { data: newRoom, error: createError } = await supabase
        .from('chat_rooms')
        .insert({
          id: roomId,
          name: roomName,
          description: 'Default chat room',
          is_private: false,
          created_by: user.id
        })
        .select()
        .single();

      if (createError) {
        // If room creation fails, try to send message anyway (might work if room exists but query failed)
        console.log('Room creation failed, attempting to send message anyway:', createError.message);
      }
    }

    // Now send the message
    const { error } = await supabase
      .from('messages')
      .insert({
        content: newMessage.trim(),
        user_id: user.id,
        room_id: roomId
      });

    if (error) {
      toast({
        title: "Failed to send message",
        description: error.message,
        variant: "destructive"
      });
    } else {
      setNewMessage('');
    }
    setLoading(false);
  };

  const handleSignOut = async () => {
    if (user) {
      // Send leave notification
      await sendSystemMessage(`${user.user_metadata?.display_name || user.email} left the chat`);
      
      await supabase
        .from('profiles')
        .update({ status: 'offline' })
        .eq('user_id', user.id);
    }
    await signOut();
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <div className="w-64 bg-card border-r border-border">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold flex items-center">
              <Users className="w-4 h-4 mr-2" />
              Online ({onlineUsers.length})
            </h2>
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
        
        <ScrollArea className="h-[calc(100vh-80px)]">
          <div className="p-4 space-y-2">
            {onlineUsers.map((profile) => (
              <div key={profile.user_id} className="flex items-center space-x-3 p-2 rounded-md hover:bg-accent">
                <Avatar className="w-8 h-8">
                  <AvatarImage src={profile.avatar_url} />
                  <AvatarFallback className="text-xs">
                    {getInitials(profile.display_name || profile.username)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {profile.display_name || profile.username}
                  </p>
                  <div className="flex items-center">
                    <div className="w-2 h-2 bg-green-500 rounded-full mr-1"></div>
                    <span className="text-xs text-muted-foreground">Online</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-card">
          <div>
            <h1 className="text-xl font-semibold">
              {roomInfo?.name || 'Loading...'}
            </h1>
            <p className="text-sm text-muted-foreground">
              Welcome, {user?.user_metadata?.display_name || user?.email}!
            </p>
          </div>
          <div className="flex items-center space-x-2">
            {roomInfo && (
              <UserInvitation 
                roomId={roomId} 
                roomName={roomInfo.name}
                isPrivate={roomInfo.isPrivate}
                onMemberAdded={() => {/* Refresh online users */}}
              />
            )}
            <ThemeToggle />
            <Button onClick={handleSignOut} variant="outline" size="sm">
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 p-4">
          {!roomInfo ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-muted-foreground">Loading room...</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => {
              const isOwnMessage = message.user_id === user?.id;
              const isSystemMessage = message.message_type === 'system';
              
              if (isSystemMessage) {
                return (
                  <div key={message.id} className="flex justify-center">
                    <div className="bg-muted/50 px-3 py-1 rounded-full text-xs text-muted-foreground">
                      {message.content}
                    </div>
                  </div>
                );
              }
              
              return (
                <div
                  key={message.id}
                  className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`flex max-w-[70%] ${isOwnMessage ? 'flex-row-reverse' : 'flex-row'}`}>
                    <Avatar className="w-8 h-8 mx-2">
                      <AvatarImage src={message.profiles?.avatar_url} />
                      <AvatarFallback className="text-xs">
                        {getInitials(message.profiles?.display_name || message.profiles?.username || 'U')}
                      </AvatarFallback>
                    </Avatar>
                    
                    <div className={`flex flex-col ${isOwnMessage ? 'items-end' : 'items-start'}`}>
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="text-xs font-medium">
                          {message.profiles?.display_name || message.profiles?.username}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatTime(message.created_at)}
                          {message.edited_at && (
                            <span className="ml-1 italic">(edited)</span>
                          )}
                        </span>
                      </div>
                      
                      <Card className={`p-3 max-w-[70%] ${
                        isOwnMessage 
                          ? 'bg-primary text-primary-foreground ml-auto' 
                          : 'bg-muted mr-auto'
                      }`}>
                        {editingMessageId === message.id ? (
                          <div className="space-y-2">
                            <Input
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              className="text-sm"
                              autoFocus
                            />
                            <div className="flex space-x-2">
                              <Button
                                size="sm"
                                onClick={saveEdit}
                                className="h-6 px-2"
                              >
                                <Check className="w-3 h-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={cancelEditing}
                                className="h-6 px-2"
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="group relative">
                            <p className="text-sm">{message.content}</p>
                            {isOwnMessage && !isSystemMessage && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => startEditing(message.id, message.content)}
                                className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0"
                              >
                                <Edit2 className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        )}
                        
                        {/* Message Reactions */}
                        {message.reactions && Object.keys(message.reactions).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {Object.entries(message.reactions).map(([emoji, userIds]) => (
                              <Button
                                key={emoji}
                                variant="ghost"
                                size="sm"
                                className={`h-6 px-2 text-xs ${
                                  (userIds as string[]).includes(user?.id || '') 
                                    ? 'bg-primary/20 border border-primary/30' 
                                    : 'hover:bg-muted-foreground/10'
                                }`}
                                onClick={() => addReaction(message.id, emoji)}
                              >
                                <span className="mr-1">{emoji}</span>
                                <span>{(userIds as string[]).length}</span>
                              </Button>
                            ))}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs opacity-60 hover:opacity-100"
                              onClick={() => addReaction(message.id, '👍')}
                            >
                              <Smile className="w-3 h-3" />
                            </Button>
                          </div>
                        )}
                      </Card>
                    </div>
                  </div>
                </div>
              );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </ScrollArea>

        {/* Typing Indicators */}
        {typingUsers.length > 0 && (
          <div className="px-4 py-2 text-sm text-muted-foreground border-t border-border bg-muted/50">
            {typingUsers.length === 1 
              ? `${typingUsers[0]} is typing...`
              : `${typingUsers.slice(0, -1).join(', ')} and ${typingUsers[typingUsers.length - 1]} are typing...`
            }
          </div>
        )}

        {/* Message Input */}
        <div className="p-4 border-t border-border bg-card">
          <form onSubmit={sendMessage} className="flex space-x-2">
            <div className="flex space-x-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {/* File upload */}}
                className="p-2"
              >
                <Paperclip className="w-4 h-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={isRecording ? stopRecording : startRecording}
                className={`p-2 ${isRecording ? 'text-red-500' : ''}`}
              >
                {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {/* Emoji picker */}}
                className="p-2"
              >
                <Smile className="w-4 h-4" />
              </Button>
              <MiniGame roomId={roomId} />
            </div>
            <Input
              value={newMessage}
              onChange={(e) => {
                setNewMessage(e.target.value);
                handleTyping();
              }}
              placeholder="Type your message..."
              disabled={loading}
              className="flex-1"
            />
            <Button type="submit" disabled={loading || !newMessage.trim()}>
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ChatRoom;