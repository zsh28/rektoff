import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Account4 } from "../target/types/account_4";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";

describe("PDA Collision Vulnerability Fixed", () => {
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
  
  const testId = new anchor.BN(1);
  const testName = "jon_test";

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

  it("should demonstrate PDA collision is now fixed", async () => {
    console.log("Testing PDA collision fix");
    
    // Generate PDAs with proper prefixes
    const [collectionAuthorityPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("authority"),
        testId.toArrayLike(Buffer, "le", 8),
        Buffer.from(testName)
      ],
      program.programId
    );

    const [userVaultPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("user_vault"),
        testId.toArrayLike(Buffer, "le", 8),
        Buffer.from(testName)
      ],
      program.programId
    );

    // Verify PDAs are now different
    assert.notEqual(
      collectionAuthorityPDA.toBase58(),
      userVaultPDA.toBase58(),
      "Collection authority PDA and user vault PDA should be different now"
    );

    console.log("PDA collision fixed:");
    console.log("- Collection Authority PDA:", collectionAuthorityPDA.toBase58());
    console.log("- User Vault PDA:", userVaultPDA.toBase58());
    console.log("- PDAs are now different - vulnerability fixed");

    // Step 1: Create collection authority
    console.log("\nStep 1: Creating collection authority");
    const createCollectionTxSig = await program.methods
      .initializeCollectionAuthority(testId, testName)
      .accounts({
        collectionAuthority: collectionAuthorityPDA,
        payer: collectionOwner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([collectionOwner])
      .rpc();

    await showProgramLogs(createCollectionTxSig, "Collection Authority Creation (Fixed)");
    console.log("Collection authority created successfully");

    // Step 2: Create user vault
    console.log("\nStep 2: Creating user vault");
    const createVaultTxSig = await program.methods
      .initializeUserVault(testId, testName)
      .accounts({
        userVault: userVaultPDA,
        payer: vaultUser.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([vaultUser])
      .rpc();

    await showProgramLogs(createVaultTxSig, "User Vault Creation (Fixed)");
    console.log("User vault created successfully - no collision");

    // Step 3: Verify both accounts exist and have correct data
    console.log("\nStep 3: Verifying account data");
    const collectionAuthority = await program.account.collectionAuthority.fetch(collectionAuthorityPDA);
    const userVault = await program.account.userVault.fetch(userVaultPDA);

    console.log("Collection Authority data:", collectionAuthority);
    console.log("User Vault data:", userVault);

    assert.equal(collectionAuthority.collectionId.toNumber(), testId.toNumber());
    assert.equal(collectionAuthority.collectionName, testName);
    assert.equal(collectionAuthority.canMint.toNumber(), 1);

    assert.equal(userVault.userId.toNumber(), testId.toNumber());
    assert.equal(userVault.vaultName, testName);
    assert.equal(userVault.balance.toNumber(), 0);

    // Step 4: Test operations work correctly
    console.log("\nStep 4: Testing operations on respective accounts");
    
    // Test minting with collection authority
    const mintTxSig = await program.methods
      .mintNft(testId, testName)
      .accounts({
        collectionAuthority: collectionAuthorityPDA,
        minter: collectionOwner.publicKey,
      })
      .signers([collectionOwner])
      .rpc();

    await showProgramLogs(mintTxSig, "NFT Minting (Fixed)");
    console.log("NFT minted successfully using collection authority");

    // Test deposit to vault
    const depositAmount = new anchor.BN(100);
    const depositTxSig = await program.methods
      .depositToVault(testId, testName, depositAmount)
      .accounts({
        userVault: userVaultPDA,
        user: vaultUser.publicKey,
      })
      .signers([vaultUser])
      .rpc();

    await showProgramLogs(depositTxSig, "Vault Deposit (Fixed)");
    console.log("Deposit to vault successful");

    // Verify vault balance updated
    const vaultAfterDeposit = await program.account.userVault.fetch(userVaultPDA);
    assert.equal(vaultAfterDeposit.balance.toNumber(), depositAmount.toNumber());

    const [vaultAuthorityPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("vault_authority"),
        testId.toArrayLike(Buffer, "le", 8),
        Buffer.from(testName)
      ],
      program.programId
    );
    // Test withdrawal from vault
    const withdrawAmount = new anchor.BN(50);
    const withdrawTxSig = await program.methods
      .withdrawFromVault(testId, testName, withdrawAmount)
      .accounts({
        userVault: userVaultPDA,
        vaultAuthority: vaultAuthorityPDA,
        user: vaultUser.publicKey,
      })
      .signers([vaultUser])
      .rpc();

    await showProgramLogs(withdrawTxSig, "Vault Withdrawal (Fixed)");
    console.log("Withdrawal from vault successful");

    // Verify final vault balance
    const vaultAfterWithdraw = await program.account.userVault.fetch(userVaultPDA);
    assert.equal(vaultAfterWithdraw.balance.toNumber(), 50);

    console.log("Both collection and user vault authorities can coexist with same ID/name but different prefixes");

    // Security Analysis
    console.log("\n=== SECURITY FIX ANALYSIS ===");
    console.log("Fix Applied: Unique PDA Prefixes");
    console.log("- Collection authority uses 'authority' prefix");
    console.log("- User vault uses 'user_vault' prefix");
    console.log("- Vault authority uses 'vault_authority' prefix");
    console.log("- Vault authority is a separate account type and it's created");
    console.log("- Different prefixes prevent PDA collisions");
    console.log("- Each account type has unique address space");
  });
});
