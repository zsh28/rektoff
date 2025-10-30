import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Account1 } from "../target/types/account_1";
import { Keypair, PublicKey } from "@solana/web3.js";
import { expect } from "chai";

describe("NFT Marketplace Account Security Fixed", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.account1 as Program<Account1>;
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
  let aliceProfilePDA: PublicKey;
  let aliceProfileBump: number;
  let bobProfilePDA: PublicKey;
  let bobProfileBump: number;

  beforeEach(async () => {
    alice = Keypair.generate();
    bob = Keypair.generate();

    [aliceProfilePDA, aliceProfileBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("profile"), alice.publicKey.toBuffer()],
      program.programId
    );

    [bobProfilePDA, bobProfileBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("profile"), bob.publicKey.toBuffer()],
      program.programId
    );

    await provider.connection.requestAirdrop(alice.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(bob.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  it("should prevent account takeover with PDA-based profiles", async () => {
    console.log("Testing secure profile initialization");
    console.log("Alice:", alice.publicKey.toBase58());
    console.log("Bob:", bob.publicKey.toBase58());
    console.log("Alice's profile PDA:", aliceProfilePDA.toBase58());
    console.log("Bob's profile PDA:", bobProfilePDA.toBase58());

    // Step 1: Alice initializes her profile
    console.log("\nStep 1: Alice creates her profile");
    const aliceInitTxSig = await program.methods
      .initializeUserProfile("alice_the_artist")
      .accounts({
        userProfile: aliceProfilePDA,
        authority: alice.publicKey,
      })
      .signers([alice])
      .rpc();

    await showProgramLogs(aliceInitTxSig, "Alice's Secure Profile Creation");

    let aliceProfileData = await program.account.userProfile.fetch(aliceProfilePDA);
    console.log("Alice's profile created successfully");
    console.log("- Authority:", aliceProfileData.authority.toBase58());
    console.log("- Username:", aliceProfileData.username);
    console.log("- NFT Count:", aliceProfileData.nftCount.toString());
    
    expect(aliceProfileData.authority.toBase58()).to.equal(alice.publicKey.toBase58());
    expect(aliceProfileData.username).to.equal("alice_the_artist");

    // Step 2: Bob creates his own profile
    console.log("\nStep 2: Bob creates his own separate profile");
    const bobInitTxSig = await program.methods
      .initializeUserProfile("bob_the_collector")
      .accounts({
        userProfile: bobProfilePDA,
        authority: bob.publicKey,
      })
      .signers([bob])
      .rpc();

    await showProgramLogs(bobInitTxSig, "Bob's Secure Profile Creation");

    let bobProfileData = await program.account.userProfile.fetch(bobProfilePDA);
    console.log("Bob's profile created successfully");
    console.log("- Authority:", bobProfileData.authority.toBase58());
    console.log("- Username:", bobProfileData.username);
    
    expect(bobProfileData.authority.toBase58()).to.equal(bob.publicKey.toBase58());
    expect(bobProfileData.username).to.equal("bob_the_collector");

    // Step 3: Alice lists an NFT
    console.log("\nStep 3: Alice lists an NFT");
    const nftMint = Keypair.generate().publicKey;
    const aliceListTxSig = await program.methods
      .listNft(new anchor.BN(1000000000), nftMint)
      .accounts({
        userProfile: aliceProfilePDA,
        authority: alice.publicKey,
      })
      .signers([alice])
      .rpc();

    await showProgramLogs(aliceListTxSig, "Alice's NFT Listing");

    aliceProfileData = await program.account.userProfile.fetch(aliceProfilePDA);
    console.log("Alice listed NFT, count:", aliceProfileData.nftCount.toString());
    expect(aliceProfileData.nftCount.toString()).to.equal("1");

    // Step 4: Bob cannot attack Alice's profile
    console.log("\nStep 4: Testing attack prevention");
    try {
      const attackTxSig = await program.methods
        .initializeUserProfile("bob_the_hacker")
        .accounts({
          userProfile: aliceProfilePDA,
          authority: bob.publicKey,
        })
        .signers([bob])
        .rpc();
      
      // If we somehow get here, show the logs
      await showProgramLogs(attackTxSig, "Bob's Failed Attack Attempt");
      throw new Error("Bob should not be able to reinitialize Alice's profile");
    } catch (error) {
      console.log("Attack prevented:", error.message);
      expect(error.message).to.include("A seeds constraint was violated");
    }

    // Step 5: Verify Alice's profile is still secure
    console.log("\nStep 5: Verifying Alice's profile integrity");
    aliceProfileData = await program.account.userProfile.fetch(aliceProfilePDA);
    console.log("Alice's profile after attack attempt:");
    console.log("- Authority:", aliceProfileData.authority.toBase58());
    console.log("- Username:", aliceProfileData.username);
    console.log("- NFT Count:", aliceProfileData.nftCount.toString());
    
    expect(aliceProfileData.authority.toBase58()).to.equal(alice.publicKey.toBase58());
    expect(aliceProfileData.username).to.equal("alice_the_artist");
    expect(aliceProfileData.nftCount.toString()).to.equal("1");

    // Step 6: Bob cannot control Alice's profile
    console.log("\nStep 6: Bob cannot perform operations on Alice's profile");
    try {
      const bobAccessTxSig = await program.methods
        .listNft(new anchor.BN(2000000000), Keypair.generate().publicKey)
        .accounts({
          userProfile: aliceProfilePDA,
          authority: bob.publicKey,
        })
        .signers([bob])
        .rpc();
      
      // If we somehow get here, show the logs
      await showProgramLogs(bobAccessTxSig, "Bob's Failed Access Attempt");
      throw new Error("Bob should not be able to control Alice's profile");
    } catch (error) {
      console.log("Bob's unauthorized access rejected:", error.message);
      expect(error.message).to.include("Unauthorized");
    }

    // Step 7: Alice retains full control
    console.log("\nStep 7: Alice retains full control of her profile");
    const aliceSecondListTxSig = await program.methods
      .listNft(new anchor.BN(2000000000), Keypair.generate().publicKey)
      .accounts({
        userProfile: aliceProfilePDA,
        authority: alice.publicKey,
      })
      .signers([alice])
      .rpc();

    await showProgramLogs(aliceSecondListTxSig, "Alice's Second NFT Listing (Retains Control)");

    aliceProfileData = await program.account.userProfile.fetch(aliceProfilePDA);
    console.log("Alice listed another NFT, count:", aliceProfileData.nftCount.toString());
    expect(aliceProfileData.nftCount.toString()).to.equal("2");

    // Security Analysis
    console.log("\n=== SECURITY FIX ANALYSIS ===");
    console.log("Fix Applied: PDA-based Account Derivation");
    console.log("- Each user gets unique PDA derived from their public key");
    console.log("- 'init' constraint prevents account reinitialization");
    console.log("- Seeds constraint ensures only owner can initialize their PDA");
    console.log("- Results in complete prevention of account takeover");
  });
});

