# MetaLend Security Challenge — Student Instructions

Welcome to the MetaLend Security Bootcamp Capstone Project!

---

## 🎓 Your Mission

You are a security auditor tasked with finding and fixing vulnerabilities in MetaLend, a Solana lending protocol. The original developers rushed their launch and left mistakes behind. Focus on the following pillars:

1. **Find vulnerabilities** through code review and testing.
2. **Exploit them** by writing at least two (ideally three) PoC test cases.
3. **Document your findings** with clear, actionable explanations.

## 🏗️ Protocol Overview

MetaLend is a flexible lending protocol with these features:
- Multi-asset support (any SPL token)
- Permissionless market creation
- Interest-bearing cTokens for suppliers
- Cross-asset borrowing with collateral
- Liquidation system for bad debt
- Flash loans for arbitrage

## 🧪 Getting Started

### 1. Set Up Your Environment

> **Required Anchor CLI:** `v0.31.1`

```bash
# Install dependencies
yarn install

# Build the program
anchor build

# Run existing tests
anchor test
```

### 2. Explore the Codebase

Start with the main files to understand the protocol:
- `src/lib.rs` - Entry points for all instructions
- `src/state.rs` - Account structures and data layout
- `src/instructions/` - Core business logic

### 3. Run Happy Path Tests

The existing tests cover basic functionality:

```bash
anchor test
```

### PoC Example

Use structured, readable tests that highlight impact and remediation steps. A lightweight template:

```typescript
it("EXPLOIT: PDA collision vulnerability", async () => {
  // Step 1: Setup conditions for exploit
  // Step 2: Execute the attack
  // Step 3: Verify the exploit worked
  // Step 4: Show impact (funds stolen, etc.)
});
```


## 📝 Deliverables

Create a `SECURITY_REPORT.md` file containing:

### For Each Vulnerability:

1. **Title** — Clear, descriptive name.
2. **Severity** — Critical / High / Medium / Low.
3. **Location** — Specific file and line numbers.
4. **Description** — What the vulnerability is and why it exists.
5. **Impact** — What an attacker could achieve.
6. **Proof of Concept** — Code demonstrating the exploit.
7. **Recommendation** — How to fix it properly.

### Example Format:

```markdown
## PDA Collision Attack

**Severity**: Critical
**Location**: `contexts.rs:48`, `contexts.rs:157`

**Description**: The user deposit account and market authority use identical PDA seeds...

**Impact**: An attacker can create a user deposit account that collides with a market authority PDA...

**Proof of Concept**:
```typescript
// Your exploit test code here
```

**Recommendation**: Use unique seed prefixes for different account types...

```

## Submission Instructions

All submissions are due by **November 31 (11:59 PM PST)**.

To complete your capstone:

1. **Prepare your submission folder.**
   - Include your `SECURITY_REPORT.md` with all findings.
   - Implement exploit tests in `tests/meta-lend.ts`.
   - (Optional) include extra test coverage or notes if helpful.
2. **Verify your tests run.** Capture or reference `anchor test` output showing reproducibility.
3. **Upload your folder** to Google Drive or similar (no ZIP or archived uploads).
4. **Share access** with `bootcamp@rektoff.xyz` and `mario@rektoff.xyz`.
   - Ensure link sharing is turned on (view access is fine).
   - Recommended: drop a quick message in `#capstone-project` or DM Lucas on Slack.

---

## Scoring Criteria

- **Completeness**: Did you find most of the vulnerabilities?
- **Understanding**: Do you clearly explain each issue?
- **Impact Assessment**: Do you understand the real-world consequences?
- **Exploit Quality**: Are your proof-of-concepts convincing?
- **Fix Quality**: Are your patches secure and complete?
- **Testing**: Do you have comprehensive test coverage?

## Hints & Tips

1. **Start Simple** — Begin with obvious issues like missing `require!` statements.
2. **Follow the Money** — Focus on functions that move tokens or change balances.
3. **Question Everything** — Why is this check here? What if it wasn't?
4. **Think Economically** — What would make this profitable to exploit?
5. **Test Edge Cases** — What happens with zero amounts? Maximum values?
6. **Read the Docs** — Understanding Anchor's security features helps spot bypasses.

## Important Notes

- **This is intentionally vulnerable code** — don't use patterns from this project in real protocols.
- **Work independently** — this is an individual assessment.
- **Ask for clarification** if instructions are unclear, but not for hints about specific vulnerabilities.
- **Document your process** — show your thinking, not just your answers.
- **DO NOT USE LLMs** — you can ask general Solana/Anchor questions, but do not use them to find vulnerabilities. We assess this and disqualify if we see such violation.
- **Everything market with CAPSTONE_SAFE is assumed safe** - some implementation details are hardcoded and marked with CAPSTONE_SAFE, assume that piece of code is safe


## Good Luck!

Remember: every vulnerability you find here represents a real attack vector that has been used against production protocols. Your skills in finding and fixing these issues could save millions of dollars in the real world.

Happy hunting! 

---

**Questions?** Reach out to the instructors, but remember - we can help with technical setup issues, not with finding the actual vulnerabilities!