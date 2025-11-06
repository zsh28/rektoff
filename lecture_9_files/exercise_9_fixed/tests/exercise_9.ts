import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Exercise9 } from "../target/types/exercise_9";
import { FakeRoyaltyProgram } from "../target/types/fake_royalty_program";
import { 
  PublicKey, 
  Keypair, 
  SystemProgram,
  LAMPORTS_PER_SOL 
} from "@solana/web3.js";
import { expect } from "chai";

describe("Confused Deputy Attack - Fixed Version", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.Exercise9 as Program<Exercise9>;
  const fakeRoyaltyProgram = anchor.workspace.FakeRoyaltyProgram as Program<FakeRoyaltyProgram>;
  const provider = anchor.getProvider();

  // Test accounts
  let seller: Keypair;
  let buyer: Keypair;
  let nftMint: PublicKey;
  let listingPda: PublicKey;
  let escrowPda: PublicKey;

  before(async () => {
    // Create test keypairs
    seller = Keypair.generate();
    buyer = Keypair.generate();
    nftMint = Keypair.generate().publicKey;

    // Fund accounts
    await provider.connection.requestAirdrop(seller.publicKey, 2 * LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(buyer.publicKey, 5 * LAMPORTS_PER_SOL);
    
    // Wait for airdrops to confirm
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Calculate PDAs
    [listingPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("listing"),
        seller.publicKey.toBuffer(),
        nftMint.toBuffer(),
      ],
      program.programId
    );

    [escrowPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("escrow"),
        seller.publicKey.toBuffer(),
        nftMint.toBuffer(),
      ],
      program.programId
    );

    // Create NFT listing
    const price = new anchor.BN(1 * LAMPORTS_PER_SOL); // 1 SOL

    await program.methods
      .createListing(nftMint, price)
      .accounts({
        listing: listingPda,
        escrow: escrowPda,
        seller: seller.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([seller])
      .rpc();

    console.log("✅ Setup complete - NFT listing created");
  });

  it("🛡️ SECURITY FIX: Fake royalty program is rejected", async () => {
    console.log("\n" + "=".repeat(80));
    console.log("🛡️ TESTING SECURITY FIX - FAKE PROGRAM REJECTION");
    console.log("=".repeat(80));

    const royaltyPercentage = 10;
    const buyerBalanceBefore = await provider.connection.getBalance(buyer.publicKey);

    console.log(`\n🚨 ATTACK ATTEMPT:`);
    console.log(`   Trying to use FAKE royalty program: ${fakeRoyaltyProgram.programId.toString()}`);
    console.log(`   Expected result: Transaction should FAIL with validation error`);

    try {
      // 🚨 Try to use the SECURE function with FAKE program (should fail!)
      await program.methods
        .purchaseNftWithRoyaltiesSafe(royaltyPercentage)
        .accounts({
          listing: listingPda,
          escrow: escrowPda,
          buyer: buyer.publicKey,
          royaltyProgram: fakeRoyaltyProgram.programId, // 🚨 FAKE PROGRAM!
          seller: seller.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([buyer])
        .rpc();

      // If we reach here, the security fix failed!
      throw new Error("🚨 SECURITY FAILURE: Fake program was accepted!");

    } catch (error) {
      // Check if it's the expected validation error
      if (error.message.includes("UntrustedRoyaltyProgram") || 
          error.message.includes("constraint was violated") ||
          error.message.includes("Untrusted royalty program")) {
        
        console.log(`\n🛡️ SECURITY SUCCESS: Fake program was REJECTED!`);
        console.log(`   Error: ${error.message}`);
        
        // Verify buyer's balance is protected (only small transaction fee lost)
        const buyerBalanceAfter = await provider.connection.getBalance(buyer.publicKey);
        const balanceChange = buyerBalanceBefore - buyerBalanceAfter;
        
        console.log(`\n💰 BUYER PROTECTION VERIFIED:`);
        console.log(`   Balance before: ${buyerBalanceBefore / LAMPORTS_PER_SOL} SOL`);
        console.log(`   Balance after: ${buyerBalanceAfter / LAMPORTS_PER_SOL} SOL`);
        console.log(`   Lost to fees: ${balanceChange / LAMPORTS_PER_SOL} SOL (minimal)`);
        
        // Verify only minimal transaction fee was lost
        expect(balanceChange).to.be.lessThan(100_000); // Less than 0.0001 SOL
        
        console.log(`\n✅ ATTACK PREVENTION CONFIRMED!`);
        console.log(`   ✅ Fake royalty program was rejected by security constraint`);
        console.log(`   ✅ Buyer funds were protected from theft`);
        console.log(`   ✅ Only legitimate royalty programs are accepted`);
        
      } else {
        // Unexpected error - test failed
        throw new Error("Unexpected error: " + error.message);
      }
    }

    console.log("\n" + "=".repeat(80));
  });
});

// cd lecture_3/exercise_9_fixed && solana-test-validator --reset
// anchor build && anchor deploy && anchor test
// anchor test --skip-local-validator --skip-build
