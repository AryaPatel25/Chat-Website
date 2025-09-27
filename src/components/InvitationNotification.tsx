import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bell, Check, X, Users, Mail } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Invitation {
  id: string;
  room_id: string;
  invited_by: string;
  invited_user: string;
  status: 'pending' | 'accepted' | 'declined';
  message: string;
  created_at: string;
  room_name?: string;
  inviter_name?: string;
}

const InvitationNotification: React.FC = () => {
  const { user } = useAuth();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (user) {
      fetchInvitations();
      setupRealtimeSubscription();
    }
  }, [user]);

  const fetchInvitations = async () => {
    if (!user) return;

    setLoading(true);
    
    // Fetch pending invitations for current user
    const { data: invitationData, error: invitationError } = await supabase
      .from('invitations')
      .select(`
        *,
        chat_rooms!inner(name)
      `)
      .eq('invited_user', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (invitationError) {
      toast({
        title: "Failed to load invitations",
        description: invitationError.message,
        variant: "destructive"
      });
      return;
    }

    // Fetch inviter names
    const inviterIds = [...new Set(invitationData?.map(inv => inv.invited_by) || [])];
    const { data: inviterData } = await supabase
      .from('profiles')
      .select('user_id, display_name, username')
      .in('user_id', inviterIds);

    // Combine data
    const enrichedInvitations = invitationData?.map(invitation => ({
      ...invitation,
      room_name: invitation.chat_rooms.name,
      inviter_name: inviterData?.find(p => p.user_id === invitation.invited_by)?.display_name || 
                   inviterData?.find(p => p.user_id === invitation.invited_by)?.username || 'Unknown'
    })) || [];

    setInvitations(enrichedInvitations);
    setPendingCount(enrichedInvitations.length);
    setLoading(false);
  };

  const setupRealtimeSubscription = () => {
    if (!user) return;

    const channel = supabase
      .channel('invitations-channel')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'invitations',
          filter: `invited_user=eq.${user.id}`
        },
        (payload) => {
          fetchInvitations(); // Refresh invitations
          
          // Show notification
          toast({
            title: "New Room Invitation",
            description: "You've been invited to join a chat room",
          });
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  };

  const respondToInvitation = async (invitationId: string, status: 'accepted' | 'declined') => {
    const invitation = invitations.find(inv => inv.id === invitationId);
    if (!invitation) return;

    // Update invitation status
    const { error: updateError } = await supabase
      .from('invitations')
      .update({ status })
      .eq('id', invitationId);

    if (updateError) {
      toast({
        title: "Failed to respond to invitation",
        description: updateError.message,
        variant: "destructive"
      });
      return;
    }

    if (status === 'accepted') {
      // Add user to room
      const { error: memberError } = await supabase
        .from('room_members')
        .insert({
          room_id: invitation.room_id,
          user_id: user?.id,
          role: 'member',
          joined_at: new Date().toISOString()
        });

      if (memberError) {
        toast({
          title: "Failed to join room",
          description: memberError.message,
          variant: "destructive"
        });
        return;
      }

      toast({
        title: "Invitation accepted",
        description: `You've joined "${invitation.room_name}"`,
      });
    } else {
      toast({
        title: "Invitation declined",
        description: "You've declined the invitation",
      });
    }

    // Refresh invitations
    fetchInvitations();
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleDateString();
  };

  if (!user) return null;

  return (
    <div className="relative">
      {/* Notification Bell */}
      <div className="relative">
        <Bell className="w-5 h-5 cursor-pointer hover:text-primary transition-colors" />
        {pendingCount > 0 && (
          <Badge 
            variant="destructive" 
            className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 text-xs"
          >
            {pendingCount}
          </Badge>
        )}
      </div>

      {/* Invitations Dropdown */}
      {pendingCount > 0 && (
        <Card className="absolute top-8 right-0 w-80 z-50 shadow-lg">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center space-x-2">
              <Mail className="w-4 h-4" />
              <span>Room Invitations ({pendingCount})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-64">
              <div className="space-y-3">
                {invitations.map((invitation) => (
                  <div key={invitation.id} className="p-3 border rounded-lg space-y-3">
                    <div>
                      <p className="font-medium text-sm">{invitation.room_name}</p>
                      <p className="text-xs text-muted-foreground">
                        Invited by {invitation.inviter_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatTime(invitation.created_at)}
                      </p>
                    </div>
                    
                    {invitation.message && (
                      <p className="text-xs text-muted-foreground bg-muted p-2 rounded">
                        "{invitation.message}"
                      </p>
                    )}

                    <div className="flex space-x-2">
                      <Button
                        size="sm"
                        onClick={() => respondToInvitation(invitation.id, 'accepted')}
                        className="flex-1 h-8 text-xs"
                      >
                        <Check className="w-3 h-3 mr-1" />
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => respondToInvitation(invitation.id, 'declined')}
                        className="flex-1 h-8 text-xs"
                      >
                        <X className="w-3 h-3 mr-1" />
                        Decline
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default InvitationNotification;
