import React, { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Gamepad2, Trophy, Users } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface GameInvite {
  id: string;
  from_user: string;
  to_user: string;
  game_type: 'rock_paper_scissors';
  status: 'pending' | 'accepted' | 'declined' | 'completed';
  room_id: string;
  created_at: string;
}

interface GameResult {
  id: string;
  invite_id: string;
  from_choice: string | null;
  to_choice: string | null;
  winner: string | null;
  created_at: string;
}

interface MiniGameProps {
  roomId: string;
}

const MiniGame: React.FC<MiniGameProps> = ({ roomId }) => {
  const { user } = useAuth();
  const [isGameDialogOpen, setIsGameDialogOpen] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [gameResult, setGameResult] = useState<GameResult | null>(null);
  const [pendingInvites, setPendingInvites] = useState<GameInvite[]>([]);

  const choices = [
    { value: 'rock', emoji: '🪨', label: 'Rock' },
    { value: 'paper', emoji: '📄', label: 'Paper' },
    { value: 'scissors', emoji: '✂️', label: 'Scissors' }
  ];

  const sendGameInvite = async (toUserId: string) => {
    if (!user) return;

    const { error } = await supabase
      .from('game_invites')
      .insert({
        from_user: user.id,
        to_user: toUserId,
        game_type: 'rock_paper_scissors',
        room_id: roomId,
        status: 'pending'
      });

    if (error) {
      toast({
        title: "Failed to send game invite",
        description: error.message,
        variant: "destructive"
      });
    } else {
      toast({
        title: "Game invite sent!",
        description: "Waiting for opponent to accept..."
      });
    }
  };

  const makeChoice = async (inviteId: string, choice: string) => {
    if (!user) return;

    setSelectedChoice(choice);

    // Check if this is the first or second choice
    const { data: existingResult } = await supabase
      .from('game_results')
      .select('*')
      .eq('invite_id', inviteId)
      .single();

    if (existingResult) {
      // Second choice - complete the game
      const { data: updatedResult } = await supabase
        .from('game_results')
        .update({ to_choice: choice })
        .eq('invite_id', inviteId)
        .select()
        .single();

      if (updatedResult) {
        const winner = determineWinner(existingResult.from_choice!, choice);
        const { data: finalResult } = await supabase
          .from('game_results')
          .update({ winner })
          .eq('invite_id', inviteId)
          .select()
          .single();

        setGameResult(finalResult);
        
        // Update invite status
        await supabase
          .from('game_invites')
          .update({ status: 'completed' })
          .eq('id', inviteId);

        toast({
          title: "Game Complete!",
          description: winner ? `Winner: ${winner}` : "It's a tie!"
        });
      }
    } else {
      // First choice
      const { data: newResult } = await supabase
        .from('game_results')
        .insert({
          invite_id: inviteId,
          from_choice: choice
        })
        .select()
        .single();

      if (newResult) {
        toast({
          title: "Choice made!",
          description: "Waiting for opponent..."
        });
      }
    }
  };

  const determineWinner = (choice1: string, choice2: string): string | null => {
    if (choice1 === choice2) return null;
    
    if (
      (choice1 === 'rock' && choice2 === 'scissors') ||
      (choice1 === 'paper' && choice2 === 'rock') ||
      (choice1 === 'scissors' && choice2 === 'paper')
    ) {
      return 'player1';
    }
    
    return 'player2';
  };

  const getChoiceEmoji = (choice: string | null) => {
    const choiceObj = choices.find(c => c.value === choice);
    return choiceObj ? choiceObj.emoji : '❓';
  };

  return (
    <Dialog open={isGameDialogOpen} onOpenChange={setIsGameDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="p-2">
          <Gamepad2 className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Trophy className="w-5 h-5" />
            <span>Rock Paper Scissors</span>
          </DialogTitle>
          <DialogDescription>
            Challenge someone to a game of Rock Paper Scissors!
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Game Rules */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">How to Play</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p>• Rock beats Scissors</p>
              <p>• Paper beats Rock</p>
              <p>• Scissors beats Paper</p>
            </CardContent>
          </Card>

          {/* Game Result */}
          {gameResult && (
            <Card className="border-primary">
              <CardHeader>
                <CardTitle className="text-center">Game Result</CardTitle>
              </CardHeader>
              <CardContent className="text-center space-y-2">
                <div className="flex justify-center items-center space-x-4">
                  <div className="text-2xl">{getChoiceEmoji(gameResult.from_choice)}</div>
                  <span className="text-lg font-bold">VS</span>
                  <div className="text-2xl">{getChoiceEmoji(gameResult.to_choice)}</div>
                </div>
                <div className="text-lg font-semibold">
                  {gameResult.winner === 'player1' ? 'Player 1 Wins!' : 
                   gameResult.winner === 'player2' ? 'Player 2 Wins!' : 
                   "It's a Tie!"}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Choice Selection */}
          {!gameResult && (
            <div className="space-y-3">
              <h3 className="font-medium">Make your choice:</h3>
              <div className="grid grid-cols-3 gap-2">
                {choices.map((choice) => (
                  <Button
                    key={choice.value}
                    variant={selectedChoice === choice.value ? "default" : "outline"}
                    onClick={() => setSelectedChoice(choice.value)}
                    className="flex flex-col h-16 p-2"
                  >
                    <span className="text-xl">{choice.emoji}</span>
                    <span className="text-xs">{choice.label}</span>
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex space-x-2">
            <Button 
              variant="outline" 
              onClick={() => setIsGameDialogOpen(false)}
              className="flex-1"
            >
              Close
            </Button>
            {selectedChoice && !gameResult && (
              <Button className="flex-1">
                Play with Random Player
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MiniGame;
