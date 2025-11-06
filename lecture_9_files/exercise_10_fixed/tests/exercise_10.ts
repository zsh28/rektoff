import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Exercise10 } from "../target/types/exercise_10";
import { expect } from "chai";
import { 
  TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from "@solana/spl-token";

describe("exercise_10", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.Exercise10 as Program<Exercise10>;
  const provider = anchor.AnchorProvider.env();

  // Test accounts
  let seller: anchor.web3.Keypair;
  let buyer: anchor.web3.Keypair;
  let mint: anchor.web3.PublicKey;

  // Token accounts
  let sellerTokenAccount: anchor.web3.PublicKey;
  let buyerTokenAccount: anchor.web3.PublicKey;
  let escrowTokenAccount: anchor.web3.PublicKey;

  // Program accounts
  let listingPda: anchor.web3.PublicKey;

  const TOKEN_PRICE = 1000; // Price in tokens

  before(async () => {
    // Initialize the program once
    try {
      await program.methods
        .initialize()
        .rpc();
      console.log("✅ Program initialized");
    } catch (error) {
      console.log("⚠️  Program may already be initialized");
    }
  });

  beforeEach(async () => {
    console.log("🔄 Setting up test accounts...");
    
    // Generate test keypairs
    seller = anchor.web3.Keypair.generate();
    buyer = anchor.web3.Keypair.generate();

    // Airdrop SOL for testing
    await provider.connection.requestAirdrop(seller.publicKey, 5 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(buyer.publicKey, 5 * anchor.web3.LAMPORTS_PER_SOL);

    // Wait for confirmations
    await new Promise(resolve => setTimeout(resolve, 1500));

    console.log("🪙 Creating token mint...");

    // Create token mint
    mint = await createMint(
      provider.connection,
      seller,
      seller.publicKey,
      null,
      9 // 9 decimals
    );

    console.log("📝 Creating Associated Token Accounts...");

    // Create Associated Token Accounts (ATAs) - this is the standard way
    const sellerATA = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      seller,
      mint,
      seller.publicKey
    );
    sellerTokenAccount = sellerATA.address;

    const buyerATA = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      buyer,
      mint,
      buyer.publicKey
    );
    buyerTokenAccount = buyerATA.address;

    // For escrow, we'll use a PDA-derived token account or another ATA
    // Let's create an ATA for a PDA as the escrow
    const [escrowAuthority] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("escrow_authority")],
      program.programId
    );

    const escrowATA = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      seller, // Payer
      mint,
      escrowAuthority, // Owner is the PDA
      true // Allow PDA owner
    );
    escrowTokenAccount = escrowATA.address;

    console.log("💎 Minting tokens to buyer...");

    // Mint tokens to buyer for testing
    await mintTo(
      provider.connection,
      seller, // Mint authority
      mint,
      buyerTokenAccount,
      seller, // Signer
      10000 // Amount
    );

    // Derive listing PDA
    [listingPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("listing"), seller.publicKey.toBuffer(), sellerTokenAccount.toBuffer()],
      program.programId
    );

    console.log("📋 Creating listing...");

    // Create a listing
    await program.methods
      .createListing(new anchor.BN(TOKEN_PRICE))
      .accounts({
        listing: listingPda,
        sellerTokenAccount: sellerTokenAccount,
        seller: seller.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([seller])
      .rpc();

    console.log("✅ Setup completed successfully");
    console.log(`   Seller ATA: ${sellerTokenAccount}`);
    console.log(`   Buyer ATA: ${buyerTokenAccount}`);
    console.log(`   Escrow ATA: ${escrowTokenAccount}`);
  });

  it("FIXED: purchase_nft_vulnerable now succeeds with fresh data", async () => {
    console.log("✅ Testing fixed purchase function...");

    let foundTransferAmountMismatch = false;
    let txSignature: string | null = null;
    let allLogs: string[] = [];
    let transactionSucceeded = false;

    try {
      txSignature = await program.methods
        .purchaseNftVulnerable()
        .accounts({
          listing: listingPda,
          buyerTokenAccount: buyerTokenAccount,
          escrowTokenAccount: escrowTokenAccount,
          buyer: buyer.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([buyer])
        .rpc({ 
          skipPreflight: false,
          commitment: 'confirmed'
        });

      console.log("✅ Transaction succeeded with signature:", txSignature);
      transactionSucceeded = true;

    } catch (error: any) {
      console.log("❌ Transaction failed with error");
      
      // Collect error logs
      if (error.logs && error.logs.length > 0) {
        allLogs = error.logs;
        foundTransferAmountMismatch = error.logs.some((log: string) => 
          log.includes("TransferAmountMismatch")
        );
      }
    }

    // If transaction succeeded, fetch logs from the transaction
    if (txSignature) {
      try {
        const txDetails = await provider.connection.getTransaction(txSignature, {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0
        });
        
        if (txDetails && txDetails.meta && txDetails.meta.logMessages) {
          allLogs = txDetails.meta.logMessages;
          foundTransferAmountMismatch = txDetails.meta.logMessages.some((log: string) => 
            log.includes("TransferAmountMismatch")
          );
        }
      } catch (logError) {
        console.log("⚠️ Failed to fetch transaction logs:", logError);
      }
    }

    // Always display all logs
    console.log("\n📋 TRANSACTION LOGS:");
    console.log("==================");
    if (allLogs.length > 0) {
      allLogs.forEach((log, index) => {
        console.log(`${index + 1}. ${log}`);
      });
    } else {
      console.log("No logs found");
    }
    console.log("==================\n");

    // Test passes if transaction succeeded AND no TransferAmountMismatch was found
    if (transactionSucceeded && !foundTransferAmountMismatch) {
      console.log("✅ FIX SUCCESSFULLY VERIFIED!");
      console.log("   Transaction succeeded without TransferAmountMismatch error");
      expect(transactionSucceeded).to.be.true;
      expect(foundTransferAmountMismatch).to.be.false;
    } else if (foundTransferAmountMismatch) {
      expect.fail("❌ TEST FAILED: Found unexpected 'TransferAmountMismatch' message - vulnerability still exists!");
    } else {
      expect.fail("❌ TEST FAILED: Transaction failed for reasons other than TransferAmountMismatch");
    }
  });
});

