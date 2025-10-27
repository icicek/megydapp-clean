> ⚠️ **INTERNAL ONLY** — Accessible only to authorized admin wallets via the Coincarnation Admin Panel.

# 🧭 Internal Architecture Index
*"The blueprint of the Fair Future — documented for resilience."*

**Project:** Coincarnation DApp  
**Maintainer:** Levershare Dev Core  
**Last Updated:** 2025-10-27

---

## 📚 Architecture Documents

| Module | Description | Path |
|:--|:--|:--|
| 🧩 **Tokenlist Intelligence System** | Symbol/name/logo unification — keeps UI consistent even when APIs fail. | [`tokenlist-architecture.md`](./tokenlist-architecture.md) |
| ⏱ **Cron Reclassifier** | Automated reclassification of tokens (healthy → walking_dead → deadcoin). | *(coming soon)* [`cron-architecture.md`](./cron-architecture.md) |
| 💸 **Claim Flow Engine** | Claimable MEGY distribution, SOL-fee system & toggle states. | *(coming soon)* [`claim-flow.md`](./claim-flow.md) |
| 💠 **CorePoint Scoring System** | Personal value currency logic — contributions, referrals, shares. | *(coming soon)* [`corepoint-system.md`](./corepoint-system.md) |

---

## 🛠 Maintenance Commands

```bash
# View this index
cat docs/index.md

# Add a new architecture document
cp docs/template.md docs/<new-doc>.md

# Commit docs updates
git add docs/
git commit -m "docs: update internal architecture index"
git push
