#!/bin/bash

# Check and update documentation if needed
# Run this before pushing: ./check-docs.sh

echo "🔍 Checking if documentation needs updating..."

# Get list of changed files
CHANGED_FILES=$(git diff --name-only HEAD~1 HEAD 2>/dev/null || git diff --name-only --cached)

# Check if any code files were changed
if echo "$CHANGED_FILES" | grep -qE '\.(js|vue|json)$'; then
    echo "📝 Code changes detected. Please review documentation:"
    echo ""
    echo "Files to check:"
    echo "  - README.md (features, setup instructions)"
    echo "  - ARCHITECTURE.md (component changes, data flows)"
    echo "  - DOCKER.md (deployment changes)"
    echo "  - frontend/README.md (Vue components, API changes)"
    echo ""
    echo "💡 Use Claude Code to review and update if needed"
else
    echo "✅ No code changes detected. Documentation likely up to date."
fi
