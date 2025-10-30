import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Account3 } from "../target/types/account_3";
import { Keypair, SystemProgram, PublicKey } from "@solana/web3.js";
import { expect } from "chai";

describe("NFT Vault Same Account Bug Fixed", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.account3 as Program<Account3>;
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

  let authority: Keypair;
  let user: Keypair;
  let monkeyCollection: Keypair;
  let tradingVault: Keypair;
  let hodlVault: Keypair;

  beforeEach(async () => {
    authority = Keypair.generate();
    user = Keypair.generate();
    monkeyCollection = Keypair.generate();
    tradingVault = Keypair.generate();
    hodlVault = Keypair.generate();

    await provider.connection.requestAirdrop(authority.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(user.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Create NFT Collection
    const createCollectionTxSig = await program.methods
      .createCollection("Solana Monkeys", "SMB")
      .accounts({
        collection: monkeyCollection.publicKey,
        authority: authority.publicKey,
      })
      .signers([authority, monkeyCollection])
      .rpc();

    await showProgramLogs(createCollectionTxSig, "Collection Creation (Fixed)");

    // Mint NFTs to collection
    const mintTxSig = await program.methods
      .mintNftsToCollection(new anchor.BN(1000))
      .accounts({
        collection: monkeyCollection.publicKey,
        authority: authority.publicKey,
      })
      .signers([authority])
      .rpc();

    await showProgramLogs(mintTxSig, "NFT Minting (Fixed)");

    // Create vaults
    const createTradingVaultTxSig = await program.methods
      .createVault("Trading Vault")
      .accounts({
        vault: tradingVault.publicKey,
        collection: monkeyCollection.publicKey,
        owner: user.publicKey,
      })
      .signers([user, tradingVault])
      .rpc();

    await showProgramLogs(createTradingVaultTxSig, "Trading Vault Creation (Fixed)");

    const createHodlVaultTxSig = await program.methods
      .createVault("HODL Vault")
      .accounts({
        vault: hodlVault.publicKey,
        collection: monkeyCollection.publicKey,
        owner: user.publicKey,
      })
      .signers([user, hodlVault])
      .rpc();

    await showProgramLogs(createHodlVaultTxSig, "HODL Vault Creation (Fixed)");

    // Deposit NFTs to trading vault
    const nftMints = [1, 2, 3, 4, 5].map(() => Keypair.generate());

    for (const [index, nftMint] of nftMints.entries()) {
      const depositTxSig = await program.methods
        .depositNftToVault(nftMint.publicKey)
        .accounts({
          vault: tradingVault.publicKey,
          collection: monkeyCollection.publicKey,
          owner: user.publicKey,
        })
        .signers([user])
        .rpc();

      await showProgramLogs(depositTxSig, `NFT Deposit ${index + 1} (Fixed)`);
    }
  });
  
  it("should handle same vault transfer correctly with commit/reload pattern", async () => {
    console.log("Testing secure same vault transfer");
    
    let tradingBefore = await program.account.nftVault.fetch(tradingVault.publicKey);
    console.log("Initial trading vault NFTs:", tradingBefore.nftCount.toString());
    
    console.log("\nExpected secure behavior:");
    console.log("- Decrease count by 1 and commit to storage");
    console.log("- Reload fresh data from storage");
    console.log("- Increase count by 1");
    console.log("- Net result: No change (5 NFTs total)");
    
    // Execute secure transfer with commit/reload pattern
    console.log("\nStep 1: Executing secure same vault transfer");
    const nftToTransfer = Keypair.generate();
    
    const txSig = await program.methods
      .transferNftBetweenVaults(nftToTransfer.publicKey)
      .accounts({
        sourceVault: tradingVault.publicKey,
        destinationVault: tradingVault.publicKey, // Same vault
        owner: user.publicKey,
      })
      .signers([user])
      .rpc();
    
    await showProgramLogs(txSig, "Secure Same Vault Transfer (Fixed)");
    
    // Check the result
    let tradingAfter = await program.account.nftVault.fetch(tradingVault.publicKey);
    console.log("\nStep 3: Checking final state");
    console.log("Trading Vault NFTs after transfer:", tradingAfter.nftCount.toString());
    
    console.log("\nSecurity analysis:");
    console.log("Expected: 5 NFTs (no net change)");
    console.log("Actual:", tradingAfter.nftCount.toString(), "NFTs");
    console.log("Result: No NFT duplication occurred");
    
    // Security fix confirmed - NFT count remains correct
    expect(tradingAfter.nftCount.toString()).to.equal("5");

    // Step 4: Test normal transfer between different vaults
    console.log("\nStep 4: Testing normal transfer between different vaults");
    const normalTransferTxSig = await program.methods
      .transferNftBetweenVaults(Keypair.generate().publicKey)
      .accounts({
        sourceVault: tradingVault.publicKey,
        destinationVault: hodlVault.publicKey, // Different vault
        owner: user.publicKey,
      })
      .signers([user])
      .rpc();

    await showProgramLogs(normalTransferTxSig, "Normal Transfer Between Different Vaults");

    const tradingAfterNormal = await program.account.nftVault.fetch(tradingVault.publicKey);
    const hodlAfterNormal = await program.account.nftVault.fetch(hodlVault.publicKey);
    
    console.log("After normal transfer:");
    console.log("- Trading vault:", tradingAfterNormal.nftCount.toString(), "NFTs");
    console.log("- HODL vault:", hodlAfterNormal.nftCount.toString(), "NFTs");
    
    expect(tradingAfterNormal.nftCount.toString()).to.equal("4");
    expect(hodlAfterNormal.nftCount.toString()).to.equal("1");

    // Security Analysis
    console.log("\n=== SECURITY FIX ANALYSIS ===");
    console.log("Fix Applied: Account Data Commit/Reload Pattern");
    console.log("- Account data changes are committed immediately");
    console.log("- Fresh data is reloaded when same account used twice");
    console.log("- Prevents stale data from causing duplication bugs");
    console.log("- Works correctly for both same-vault and cross-vault transfers");
  });
});
