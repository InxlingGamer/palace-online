# Palace Online rules

## Goal and deck

Two players use one standard 52-card deck without jokers. Empty your hand, three selected field cards, and three original hidden cards to win. Normal rank order is 3, 4, 5, 6, 7, 8, 9, 10, Jack, Queen, King, Ace. Twos are wild powers rather than ranks above Ace.

## Deal and setup

After both players ready, the server securely shuffles. Each player receives three original hidden cards and six visible setup cards. Each player chooses exactly three of those six. The chosen cards are placed face down, one over each hidden card in selection order; their values are no longer sent to the client until picked up. The other three cards form the starting hand.

To choose the starter, each hand is filtered to remove twos and sorted from low to high. The sorted ranks are compared in order. A hand with no normal card sorts after a hand containing a normal card. A complete tie is broken with secure server randomness. Suits never break ties, and the starter may play any legal card.

## Turns and drawing

A move is one card or multiple cards of exactly one rank. A normal rank must equal or exceed the top rank. Power cards are always legal. An empty or reset pile accepts any rank.

After a successful play, that player draws automatically only when holding fewer than three cards, and only until holding three while the draw pile has cards. During active play, either player may manually draw one card at any time, including outside their turn or while a seven choice is pending; drawing does not change the turn. Manual drawing is unavailable when the hand already contains five or more cards or when the draw pile is empty. A pile pickup may leave a hand above five; excess cards are never discarded. You may pick up the whole pile only on your turn during active play while it is non-empty, even if you have a legal card, except while a seven direction choice is pending. Picking up ends your turn and consumes a seven restriction targeting you.

## Power cards and precedence

- **2 — Reset:** Always legal. It leaves the pile in place, resets the next requirement, and gives the same player another move.
- **7 — Direction:** Always legal. If the pile does not burn, its player must choose higher or lower. The opponent's next completed play must be strictly above or below seven. A 2, 7, or 10 remains legal. Playing or picking up consumes the restriction; an extra turn then continues without the old restriction.
- **10 — Burn:** Always legal. It burns the entire pile, including all tens in the move, and gives the same player another move.
- **Four matching:** If the top four consecutive pile cards share a rank, the entire pile burns and the completing player moves again.

Resolution order is commit cards, direct ten burn, four-matching burn, two reset, seven choice, then normal turn handoff. A burn cancels a seven prompt created by that move. A direct ten takes priority over the matching-card check.

## Field and blind phases

Once the draw pile is empty, players keep using their existing hands. When a player's hand reaches zero, all remaining selected field cards move into their hand. After that hand is emptied, the player selects one original hidden position without seeing its value.

The selected hidden card leaves its slot permanently. A legal reveal resolves like a normal play, including powers and burns. An illegal reveal is first added to the pile, then the player takes the entire pile—including that card—into their hand and ends the turn. The player cannot select another hidden card until that hand is emptied.

## Winning and rematches

A player wins after a legal resolution when their hand and both field layers are empty. A final 2, 10, or matching-card burn wins immediately; the unused extra turn is ignored. A final 7 must receive its direction choice before victory. The final play is shown for about 1.5 seconds before the result; forfeit results appear immediately. Results show turn and pickup counts. Both players must request a rematch; the server then creates a new game ID, shuffle, deal, and setup while preserving the room seats.

An active player gets 10 minutes to reconnect, long enough to survive a locked phone or a quick app switch. Expiry during play gives the connected rival a forfeit victory. A single disconnect does not expire lobby, setup, or finished games, and finished results retain their winner. When both players leave, the room is kept for the configured room idle TTL. If a player returns after both disconnect deadlines elapsed, the absent player receives a fresh full reconnect grace.
