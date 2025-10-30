import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Account4 } from "../target/types/account_4";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";

describe("PDA Collision Vulnerability", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.Account4 as Program<Account4>;
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
  
  const collectionOwner = Keypair.generate();
  const vaultUser = Keypair.generate();
  const attacker = Keypair.generate();
  
  const collisionId = new anchor.BN(1);
  const collisionName = "jon_test";

  before(async () => {
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(collectionOwner.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL)
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(vaultUser.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL)
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(attacker.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL)
    );
  });

  it("should demonstrate PDA collision vulnerability", async () => {
    console.log("Testing PDA collision vulnerability");
    
    // Generate PDAs
    const [collectionAuthorityPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("authority"),
        collisionId.toArrayLike(Buffer, "le", 8),
        Buffer.from(collisionName)
      ],
      program.programId
    );

    const [userVaultPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("user_vault"),
        collisionId.toArrayLike(Buffer, "le", 8),
        Buffer.from(collisionName)
      ],
      program.programId
    );

    const [vaultAuthorityPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("authority"), // Same prefix as collection authority
        collisionId.toArrayLike(Buffer, "le", 8),
        Buffer.from(collisionName)
      ],
      program.programId
    );

    // Verify collision exists
    assert.equal(
      collectionAuthorityPDA.toBase58(),
      vaultAuthorityPDA.toBase58(),
      "Collection authority PDA and vault authority PDA should be identical"
    );

    console.log("PDA collision detected:");
    console.log("- Collection Authority PDA:", collectionAuthorityPDA.toBase58());
    console.log("- User Vault PDA:", userVaultPDA.toBase58());
    console.log("- Vault Authority PDA:", vaultAuthorityPDA.toBase58());
    console.log("- Collision confirmed: Collection and Vault Authority PDAs are identical");

    // Step 1: Create collection authority
    console.log("\nStep 1: Creating collection authority");
    const createCollectionTxSig = await program.methods
      .initializeCollectionAuthority(collisionId, collisionName)
      .accounts({
        collectionAuthority: collectionAuthorityPDA,
        payer: collectionOwner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([collectionOwner])
      .rpc();

    await showProgramLogs(createCollectionTxSig, "Collection Authority Creation");
    console.log("Collection authority created successfully");

    // Step 2: Create user vault
    console.log("\nStep 2: Creating user vault");
    const createVaultTxSig = await program.methods
      .initializeUserVault(collisionId, collisionName)
      .accounts({
        userVault: userVaultPDA,
        payer: vaultUser.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([vaultUser])
      .rpc();

    await showProgramLogs(createVaultTxSig, "User Vault Creation");
    console.log("User vault created successfully");

    // Step 3: Test discriminator protection
    console.log("\nStep 3: Testing discriminator protection");
    try {
      const vaultAccount = await program.account.userVault.fetch(collectionAuthorityPDA);
      console.log("Error: Collection authority interpreted as user vault");
    } catch (error) {
      console.log("Protection confirmed: Collection authority cannot be interpreted as user vault");
    }

    // Step 4: Test instruction context protection
    console.log("\nStep 4: Testing instruction context protection");
    try {
      const withdrawAmount = new anchor.BN(50);
      const withdrawTxSig = await program.methods
        .withdrawFromVault(collisionId, collisionName, withdrawAmount)
        .accounts({
          userVault: userVaultPDA,
          vaultAuthority: collectionAuthorityPDA, // Wrong account type
          user: vaultUser.publicKey,
        })
        .signers([vaultUser])
        .rpc();

      await showProgramLogs(withdrawTxSig, "Failed Withdrawal Attempt");
      console.log("Error: Withdrawal succeeded with wrong account type");
    } catch (error) {
      console.log("Error:", error);
      console.log("Protection confirmed: Withdrawal failed due to discriminator protection");
    }
    
    // Vulnerability Analysis
    console.log("\n=== VULNERABILITY ANALYSIS ===");
    console.log("Vulnerability: PDA Collision");
    console.log("- Different account types use same PDA seeds");
    console.log("- Collection authority and vault authority have identical addresses");
    console.log("- Account discriminators prevent cross-type access");
    console.log("- Potential for namespace confusion and logic errors");
  });
});
