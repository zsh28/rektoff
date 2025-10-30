import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AccountInit2 } from "../target/types/account_init_2";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";

describe("NFT Marketplace Authority Transfer Fixed", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.account2 as Program<AccountInit2>;
  const provider = anchor.getProvider();

  // Helper function to display program logs
  const showProgramLogs = async (txSig: string, description: string) => {
    console.log(`\n--- Program Logs for ${description} ---`);
    try {
      const tx = await provider.connection.getTransaction(txSig, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
      
      if (tx && tx.meta && tx.meta.logMessages) {
        tx.meta.logMessages.forEach(log => {
          if (log.includes("Program log:")) {
            console.log("📝", log.replace("Program log: ", ""));
          }
        });
      } else {
        console.log("⚠️  No logs found for this transaction");
      }
    } catch (error) {
      console.log("❌ Error retrieving logs:", error);
    }
    console.log("--- End Program Logs ---\n");
  };

  let alice: Keypair;
  let bob: Keypair;
  let aliceProfilePda: PublicKey;

  beforeEach(async () => {
    alice = Keypair.generate();
    bob = Keypair.generate();

    await provider.connection.requestAirdrop(alice.publicKey, 5 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(bob.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
    
    await new Promise(resolve => setTimeout(resolve, 1000));

    [aliceProfilePda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("profile"), alice.publicKey.toBuffer()],
      program.programId
    );
  });

  it("should prevent unauthorized authority transfer", async () => {
    console.log("Testing secure authority transfer");
    console.log("Alice:", alice.publicKey.toBase58());
    console.log("Bob:", bob.publicKey.toBase58());
    console.log("Profile PDA:", aliceProfilePda.toBase58());

    // Step 1: Setup - Alice creates profile
    console.log("\nStep 1: Alice creates her profile");
    const createTxSig = await program.methods
      .initializeProfile("alice_the_artist")
      .accounts({
        userProfile: aliceProfilePda,
        authority: alice.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([alice])
      .rpc();

    await showProgramLogs(createTxSig, "Secure Profile Creation");
    console.log("Profile created successfully");

    // Step 2: Alice lists an NFT
    console.log("\nStep 2: Alice lists an NFT");
    const nftMint = Keypair.generate().publicKey;
    const listTxSig = await program.methods
      .listNft(new anchor.BN(1_000_000_000), nftMint)
      .accounts({ userProfile: aliceProfilePda, authority: alice.publicKey })
      .signers([alice])
      .rpc();

    await showProgramLogs(listTxSig, "NFT Listing");
    console.log("NFT listed successfully");

    // Step 3: Unauthorized authority transfer attempt (now fails)
    console.log("\nStep 3: Attempting unauthorized authority transfer");
    try {
      const unauthorizedTxSig = await program.methods
        .updateProfileAuthority()
        .accounts({
          userProfile: aliceProfilePda,
          newAuthority: bob.publicKey,
          authority: alice.publicKey, // Alice not signing
        })
        .rpc(); // Only provider wallet signs
      
      // If we somehow get here, show the logs
      await showProgramLogs(unauthorizedTxSig, "Failed Unauthorized Transfer");
      throw new Error("Attack should have been prevented");
    } catch (e) {
      console.log("Attack prevented:", (e as Error).message);
      expect((e as Error).message).to.contain("Signature verification failed");
    }

    // Step 4: Alice still owns her profile
    console.log("\nStep 4: Verifying Alice still owns her profile");
    const profileAfter = await program.account.userProfile.fetch(aliceProfilePda);
    expect(profileAfter.authority.toBase58()).to.equal(alice.publicKey.toBase58());
    console.log("Alice still owns her profile:", profileAfter.authority.toBase58());

    // Step 5: Alice can still use her profile normally
    console.log("\nStep 5: Alice retains full access to her profile");
    const aliceAccessTxSig = await program.methods
      .listNft(new anchor.BN(2_000_000_000), Keypair.generate().publicKey)
      .accounts({ userProfile: aliceProfilePda, authority: alice.publicKey })
      .signers([alice])
      .rpc();

    await showProgramLogs(aliceAccessTxSig, "Alice's Continued Access");
    console.log("Alice successfully performed operations on her profile");

    // Step 6: Demonstrate proper authority transfer (Alice signs)
    console.log("\nStep 6: Demonstrating proper authority transfer with Alice's signature");
    const properTransferTxSig = await program.methods
      .updateProfileAuthority()
      .accounts({
        userProfile: aliceProfilePda,
        newAuthority: bob.publicKey,
        authority: alice.publicKey,
      })
      .signers([alice]) // Alice properly signs
      .rpc();

    await showProgramLogs(properTransferTxSig, "Proper Authority Transfer (Alice Signs)");

    const profileAfterTransfer = await program.account.userProfile.fetch(aliceProfilePda);
    console.log("Authority properly transferred to:", profileAfterTransfer.authority.toBase58());
    expect(profileAfterTransfer.authority.toBase58()).to.equal(bob.publicKey.toBase58());

    // Security Analysis
    console.log("\n=== SECURITY FIX ANALYSIS ===");
    console.log("Fix Applied: Required Signer Constraint");
    console.log("- Authority account must sign the transaction");
    console.log("- 'Signer<'info>' type ensures signature validation");
    console.log("- Prevents unauthorized authority transfers");
    console.log("- Legitimate transfers require owner consent");
  });
});
