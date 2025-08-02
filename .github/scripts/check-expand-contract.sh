#!/bin/bash

# Expand-Contract Pattern Validator
# Checks if migrations follow the safe expand-contract pattern

set -euo pipefail

echo "🔍 Analyzing migration patterns for expand-contract compliance..."

MIGRATIONS_DIR="prisma/migrations"
LATEST_MIGRATIONS=$(find "$MIGRATIONS_DIR" -name "migration.sql" -newer "$MIGRATIONS_DIR" -type f 2>/dev/null | head -5 || echo "")

if [ -z "$LATEST_MIGRATIONS" ]; then
    echo "ℹ️ No recent migrations found to analyze"
    exit 0
fi

# Check for expand-contract pattern violations
echo "Checking latest migrations for pattern compliance..."

# Pattern 1: Adding new columns (EXPAND phase)
expand_patterns=("ADD COLUMN" "CREATE TABLE" "CREATE INDEX")
expand_found=0

# Pattern 2: Data migration patterns (MIGRATE phase) 
migrate_patterns=("UPDATE.*SET" "INSERT INTO.*SELECT" "CREATE TRIGGER")
migrate_found=0

# Pattern 3: Removing old columns (CONTRACT phase)
contract_patterns=("DROP COLUMN" "DROP TABLE" "DROP INDEX")
contract_found=0

for migration_file in $LATEST_MIGRATIONS; do
    echo "Analyzing: $migration_file"
    content=$(cat "$migration_file")
    
    # Check for expand patterns
    for pattern in "${expand_patterns[@]}"; do
        if echo "$content" | grep -qi "$pattern"; then
            echo "  ✅ EXPAND: Found $pattern"
            expand_found=1
        fi
    done
    
    # Check for migrate patterns
    for pattern in "${migrate_patterns[@]}"; do
        if echo "$content" | grep -qi "$pattern"; then
            echo "  ✅ MIGRATE: Found $pattern"
            migrate_found=1
        fi
    done
    
    # Check for contract patterns
    for pattern in "${contract_patterns[@]}"; do
        if echo "$content" | grep -qi "$pattern"; then
            echo "  ⚠️ CONTRACT: Found $pattern"
            contract_found=1
        fi
    done
done

# Analyze the pattern
echo ""
echo "🎯 Expand-Contract Pattern Analysis:"

if [ "$contract_found" -eq 1 ] && [ "$expand_found" -eq 0 ] && [ "$migrate_found" -eq 0 ]; then
    echo "❌ DANGEROUS: CONTRACT operations without preceding EXPAND/MIGRATE steps!"
    echo "This could cause data loss. Ensure you've followed the full pattern:"
    echo "1. EXPAND: Add new columns/tables first"
    echo "2. MIGRATE: Transform existing data"
    echo "3. CONTRACT: Remove old columns (current step)"
    exit 1
elif [ "$contract_found" -eq 1 ]; then
    echo "⚠️ CONTRACT phase detected. Ensure:"
    echo "1. Data has been migrated to new schema"
    echo "2. Application code uses new columns"
    echo "3. Set STAGING_ALLOW_DESTRUCTIVE=true"
elif [ "$expand_found" -eq 1 ]; then
    echo "✅ EXPAND phase detected - safe for data preservation"
elif [ "$migrate_found" -eq 1 ]; then
    echo "✅ MIGRATE phase detected - data transformation in progress"
else
    echo "ℹ️ Standard migrations detected - no specific pattern identified"
fi

echo "✅ Pattern analysis complete"