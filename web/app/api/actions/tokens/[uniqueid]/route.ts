import { ObjectId } from 'mongodb';
import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import {
  ActionGetResponse,
  ACTIONS_CORS_HEADERS,
  ActionPostRequest,
  createPostResponse,
  ActionPostResponse,
} from "@solana/actions";
import {
  clusterApiUrl,
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";

async function getAssociatedTokenAddress(
  mint: PublicKey,
  owner: PublicKey
): Promise<PublicKey> {
  return (
    await PublicKey.findProgramAddress(
      [
        owner.toBuffer(),
        TOKEN_PROGRAM_ID.toBuffer(),
        mint.toBuffer(),
      ],
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
  )[0];
}

function createAssociatedTokenAccountInstruction(
  payer: PublicKey,        // The payer of the transaction (usually the user)
  associatedTokenAddress: PublicKey,  // The address of the associated token account
  owner: PublicKey,        // The owner of the associated token account
  mint: PublicKey          // The token mint address
): TransactionInstruction {
  return new TransactionInstruction({
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: associatedTokenAddress, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    data: Buffer.alloc(0),  // The instruction data (empty in this case)
  });
}


const PUMP_PROGRAM_ID = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");

export const GET = async (req: NextRequest, { params }: { params: { uniqueid: string } }) => {
  try {
    const { uniqueid } = params;
    console.log('uniqueid', uniqueid);

    const client = await clientPromise;
    const db = client.db("Cluster0");

    let blinkData;
    if (ObjectId.isValid(uniqueid)) {
      blinkData = await db.collection("blinks").findOne({ _id: new ObjectId(uniqueid) });
    }

    if (!blinkData) {
      blinkData = {
        icon: "https://example.com/pump-token-icon.png",
        label: "Buy Pump Token 🚀",
        description: "Get your Pump tokens now! Choose an amount to purchase.",
        title: "Buy Pump Tokens",
      };
    }

    const payload: ActionGetResponse = {
      icon: blinkData.icon,
      label: blinkData.label,
      description: blinkData.description,
      title: blinkData.title,
      links: {
        actions: [
          {
            href: `/api/actions/tokens/${uniqueid}?amount=100000`,
            label: `Buy 100k ${blinkData.title.slice(4)}`,
          },
          {
            href: `/api/actions/tokens/${uniqueid}?amount=500000`,
            label: `Buy 500k ${blinkData.title.slice(4)}`,
          },
          {
            href: `/api/actions/tokens/${uniqueid}?amount=1000000`,
            label: `Buy 1M ${blinkData.title.slice(4)}`,
          },
          {
            href: `/api/actions/tokens/${uniqueid}?amount={amount}`,
            label: "Custom amount",
            parameters: [
              {
                name: "amount",
                label: "Enter amount",
              },
            ],
          },
        ],
      },
    };

    return NextResponse.json(payload, {
      headers: ACTIONS_CORS_HEADERS,
    });
  } catch (error) {
    console.error("Error fetching blink data:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
};

export const OPTIONS = GET;

export const POST = async (req: NextRequest, { params }: { params: { uniqueid: string } }) => {
  try {
    const { uniqueid } = params;

    const client = await clientPromise;
    const db = client.db("Cluster0");

    let blinkData;
    if (ObjectId.isValid(uniqueid)) {
      blinkData = await db.collection("blinks").findOne({ _id: new ObjectId(uniqueid) });
    }

    const { searchParams } = new URL(req.url);
    const body: ActionPostRequest = await req.json();

    const PUMP_MINT = new PublicKey(blinkData?.mint);

    let account: PublicKey;
    try {
      account = new PublicKey(body.account);
    } catch (err) {
      throw "Invalid 'account' provided. It's not a real pubkey";
    }

    let amount: number = 0.1;
    const amountParam = searchParams.get("amount");
    if (amountParam) {
      try {
        amount = parseFloat(amountParam) || amount;
      } catch (err) {
        throw "Invalid 'amount' input";
      }
    }

    const SOLANA_RPC_URL = clusterApiUrl("mainnet-beta", false);
    if (!SOLANA_RPC_URL) throw "Unable to find RPC url...awkward...";
    const connection = new Connection(SOLANA_RPC_URL);

    const recentBlockhash = await connection.getLatestBlockhash();

    const [global] = await PublicKey.findProgramAddress(
      [Buffer.from("global")],
      PUMP_PROGRAM_ID
    );

    const [bondingCurve] = await PublicKey.findProgramAddress(
      [Buffer.from("bonding-curve"), PUMP_MINT.toBuffer()],
      PUMP_PROGRAM_ID
    );

    const bondingCurveATA = await getAssociatedTokenAddress(
      PUMP_MINT,
      bondingCurve
    );

    const userATA = await getAssociatedTokenAddress(
      PUMP_MINT,
      account
    );

    const transaction = new Transaction();

    // Add instruction to create ATA if it doesn't exist
    transaction.add(
      createAssociatedTokenAccountInstruction(
        account,
        userATA,
        account,
        PUMP_MINT
      )
    );

    const dataBuffer = Buffer.alloc(24);
    dataBuffer.write("66063d1201daebea", "hex");
    dataBuffer.writeBigUInt64LE(BigInt(amount *(10**6)), 8);
    dataBuffer.writeBigInt64LE(BigInt(-1), 16);
    const data = Buffer.from(dataBuffer);

    const buyPumpIx = new TransactionInstruction({
      programId: PUMP_PROGRAM_ID,
      keys: [
        { pubkey: global, isSigner: false, isWritable: false },
        { pubkey: new PublicKey("CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM"), isSigner: false, isWritable: true },
        { pubkey: PUMP_MINT, isSigner: false, isWritable: false },
        { pubkey: bondingCurve, isSigner: false, isWritable: true },
        { pubkey: bondingCurveATA, isSigner: false, isWritable: true },
        { pubkey: userATA, isSigner: false, isWritable: true },
        { pubkey: account, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: new PublicKey("SysvarRent111111111111111111111111111111111"), isSigner: false, isWritable: false },
        { pubkey: new PublicKey("Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1"), isSigner: false, isWritable: false },
        { pubkey: PUMP_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: data,
    });

    transaction.add(buyPumpIx);
    transaction.recentBlockhash = recentBlockhash.blockhash;
    transaction.feePayer = account;


    const payload: ActionPostResponse = await createPostResponse({
      fields: {
        transaction,
        message: "You juts Pumped It!",
      },
    });

    return NextResponse.json(payload, {
      headers: ACTIONS_CORS_HEADERS,
    });
  } catch (err) {
    console.log("-------------------------------ErrorInBuyPump----------------------------------");
    console.error(err);
    return NextResponse.json(
      {
        message: err instanceof Error ? err.message : String(err),
      },
      {
        status: 500,
        headers: ACTIONS_CORS_HEADERS,
      },
    );
  }
};