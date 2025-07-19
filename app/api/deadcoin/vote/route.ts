import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

// Number of YES votes required to mark a token as deadcoin
const DEADCOIN_VOTE_THRESHOLD = 3;

export async function POST(req: NextRequest) {
  try {
    const { wallet, tokenMint, vote } = await req.json();

    if (!wallet || !tokenMint || !['yes', 'no'].includes(vote)) {
      return NextResponse.json({ success: false, error: 'Invalid input data.' }, { status: 400 });
    }

    // Check if this wallet already voted for this token
    const existingVote = await sql`
      SELECT vote FROM deadcoin_votes
      WHERE wallet = ${wallet} AND token_mint = ${tokenMint}
      LIMIT 1
    `;

    if (existingVote.length > 0) {
      return NextResponse.json({ success: false, message: 'You have already voted for this token.' });
    }

    // Insert the new vote
    await sql`
      INSERT INTO deadcoin_votes (wallet, token_mint, vote, timestamp)
      VALUES (${wallet}, ${tokenMint}, ${vote}, NOW())
    `;

    // Count total YES votes for this token
    const voteCountResult = await sql`
      SELECT COUNT(*) AS yes_votes
      FROM deadcoin_votes
      WHERE token_mint = ${tokenMint} AND vote = 'yes'
    `;

    const yesVotes = parseInt(voteCountResult[0].yes_votes, 10);

    if (yesVotes >= DEADCOIN_VOTE_THRESHOLD) {
      // Add to Deadcoin List if not already present
      await sql`
        INSERT INTO deadcoin_list (token_mint, confirmed_at)
        VALUES (${tokenMint}, NOW())
        ON CONFLICT (token_mint) DO NOTHING
      `;
      console.log(`✅ Token ${tokenMint} added to Deadcoin List after reaching ${yesVotes} YES votes.`);
    }

    return NextResponse.json({
      success: true,
      message: `Your vote has been recorded.`,
      currentYesVotes: yesVotes
    });
  } catch (error) {
    console.error('❌ Error recording deadcoin vote:', error);
    return NextResponse.json({ success: false, error: 'Internal server error.' }, { status: 500 });
  }
}
