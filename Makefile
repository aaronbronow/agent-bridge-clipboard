# Agent Bridge Clipboard Makefile

VERSION ?= $(shell jq -r .version gemini-extension.json)
DIST_DIR = dist

SKILLS = gemini-clipboard-bridge claude-clipboard-bridge copilot-clipboard-bridge

.PHONY: all build clean test release verify headless validate matrix-clear

all: build

clean:
	@echo "Cleaning $(DIST_DIR)..."
	rm -rf $(DIST_DIR)

build: clean
	@echo "Compiling TypeScript..."
	npx tsc
	@echo "Building release v$(VERSION)..."
	
	# 1. Build the main agent-bridge-clipboard from root
	@echo "Preparing agent-bridge-clipboard..."
	mkdir -p $(DIST_DIR)/agent-bridge-clipboard/scripts
	mkdir -p $(DIST_DIR)/agent-bridge-clipboard/commands/abc
	cp SKILL.md $(DIST_DIR)/agent-bridge-clipboard/
	cp scripts/copy.sh $(DIST_DIR)/agent-bridge-clipboard/scripts/
	chmod +x $(DIST_DIR)/agent-bridge-clipboard/scripts/copy.sh
	cp dist/scripts/*.js $(DIST_DIR)/agent-bridge-clipboard/scripts/
	cp package.json $(DIST_DIR)/agent-bridge-clipboard/
	cp commands/abc/*.toml $(DIST_DIR)/agent-bridge-clipboard/commands/abc/
	cp gemini-extension.json $(DIST_DIR)/agent-bridge-clipboard/
	cp LICENSE $(DIST_DIR)/agent-bridge-clipboard/
	cp GEMINI.md $(DIST_DIR)/agent-bridge-clipboard/

	# 2. Build the other discrete bridges from skills/
	@for skill in $(SKILLS); do \
		echo "Preparing $$skill..."; \
		mkdir -p $(DIST_DIR)/$$skill/scripts; \
		if [ -f skills/$$skill/SKILL.md ]; then cp skills/$$skill/SKILL.md $(DIST_DIR)/$$skill/; fi; \
		cp scripts/copy.sh $(DIST_DIR)/$$skill/scripts/; \
		chmod +x $(DIST_DIR)/$$skill/scripts/copy.sh; \
		cp dist/scripts/abc-protocol.js $(DIST_DIR)/$$skill/scripts/; \
		cp dist/scripts/send-clip.js $(DIST_DIR)/$$skill/scripts/; \
	done

	# 3. Build the Antigravity-specific plugin structure
	@echo "Preparing antigravity-clipboard-bridge..."
	mkdir -p $(DIST_DIR)/antigravity-clipboard-bridge/skills/copy
	mkdir -p $(DIST_DIR)/antigravity-clipboard-bridge/skills/help
	cp skills/antigravity-clipboard-bridge/copy/SKILL.md $(DIST_DIR)/antigravity-clipboard-bridge/skills/copy/
	cp skills/antigravity-clipboard-bridge/help/SKILL.md $(DIST_DIR)/antigravity-clipboard-bridge/skills/help/
	cp skills/antigravity-clipboard-bridge/plugin.json $(DIST_DIR)/antigravity-clipboard-bridge/
	cp scripts/copy.sh $(DIST_DIR)/antigravity-clipboard-bridge/skills/copy/
	chmod +x $(DIST_DIR)/antigravity-clipboard-bridge/skills/copy/copy.sh
	cp dist/scripts/abc-protocol.js $(DIST_DIR)/antigravity-clipboard-bridge/skills/copy/
	cp dist/scripts/send-clip.js $(DIST_DIR)/antigravity-clipboard-bridge/skills/copy/
	cp dist/scripts/send-msg.js $(DIST_DIR)/antigravity-clipboard-bridge/skills/copy/
	cp dist/scripts/listen-once.js $(DIST_DIR)/antigravity-clipboard-bridge/skills/copy/

# --- Testing & Verification ---

test: verify

verify:
	@if [ -z "$$CLIENT_OS" ] || [ -z "$$CLIENT_TERM" ]; then \
		echo "TIP: Set CLIENT_OS and CLIENT_TERM for accurate matrix reporting."; \
		echo "     Example: CLIENT_OS=\"macOS\" CLIENT_TERM=\"iTerm2\" make verify"; \
		echo ""; \
	fi
	./tests/verify.sh

headless:
	./tests/verify.sh --headless --method=$(or $(METHOD),bridge)

validate:
	@if [ -z "$(TOKEN)" ]; then echo "Error: Use 'make validate TOKEN=<token>'"; exit 1; fi
	./tests/verify.sh --validate=$(TOKEN)

matrix-clear:
	./tests/verify.sh --clear

release: matrix-clear build
	@echo "Release v$(VERSION) prepared in $(DIST_DIR)/"

# Target for downstream projects to consume this repository
# Usage: UPSTREAM_DIR=../path/to/agent-bridge-clipboard make import-skill
import-skill:
	@if [ -z "$(UPSTREAM_DIR)" ]; then echo "Error: UPSTREAM_DIR is not set. Usage: UPSTREAM_DIR=../path/to/agent-bridge-clipboard make import-skill"; exit 1; fi
	@echo "Importing artifacts from $(UPSTREAM_DIR)..."
	@if [ ! -d "$(UPSTREAM_DIR)/dist" ]; then echo "Error: dist directory not found in $(UPSTREAM_DIR). Run 'make build' in the upstream first."; exit 1; fi
	mkdir -p .vendor/agent-bridge-clipboard
	cp -rv $(UPSTREAM_DIR)/dist/* .vendor/agent-bridge-clipboard/
	@echo "Successfully imported to .vendor/agent-bridge-clipboard/"

# Target for isolated local sandbox testing
# Usage: SANDBOX_DIR=../my-sandbox TARGET_SKILL=gemini-clipboard-bridge make deploy-sandbox
SANDBOX_DIR ?= ../agent-bridge-clipboard-sandbox
TARGET_SKILL ?= agent-bridge-clipboard
deploy-sandbox:
	@echo "Deploying $(TARGET_SKILL) to local sandbox: $(SANDBOX_DIR)..."
	mkdir -p $(SANDBOX_DIR)/scripts
	cp scripts/copy.sh $(SANDBOX_DIR)/scripts/
	chmod +x $(SANDBOX_DIR)/scripts/copy.sh
	@if [ "$(TARGET_SKILL)" = "agent-bridge-clipboard" ]; then \
		cp SKILL.md $(SANDBOX_DIR)/; \
		mkdir -p $(SANDBOX_DIR)/commands/abc; \
		cp commands/abc/*.toml $(SANDBOX_DIR)/commands/abc/; \
		cp gemini-extension.json $(SANDBOX_DIR)/; \
	elif [ "$(TARGET_SKILL)" = "antigravity-clipboard-bridge" ]; then \
		mkdir -p $(SANDBOX_DIR)/skills/copy; \
		mkdir -p $(SANDBOX_DIR)/skills/help; \
		cp skills/antigravity-clipboard-bridge/copy/SKILL.md $(SANDBOX_DIR)/skills/copy/; \
		cp skills/antigravity-clipboard-bridge/help/SKILL.md $(SANDBOX_DIR)/skills/help/; \
		cp skills/antigravity-clipboard-bridge/plugin.json $(SANDBOX_DIR)/; \
		cp scripts/copy.sh $(SANDBOX_DIR)/skills/copy/; \
		chmod +x $(SANDBOX_DIR)/skills/copy/copy.sh; \
	else \
		cp skills/$(TARGET_SKILL)/SKILL.md $(SANDBOX_DIR)/; \
	fi
	@echo "Deployment complete. You can now run 'gemini --sandbox' in $(SANDBOX_DIR)"

# Local installation targets for Antigravity CLI
install: build
	@echo "Installing plugin to ~/.gemini/config/plugins/abc..."
	mkdir -p ~/.gemini/config/plugins
	rm -rf ~/.gemini/config/plugins/abc
	cp -r $(DIST_DIR)/antigravity-clipboard-bridge ~/.gemini/config/plugins/abc
	@echo "Plugin installed successfully!"

dev-install: build
	@echo "Symlinking plugin to ~/.gemini/config/plugins/abc..."
	mkdir -p ~/.gemini/config/plugins
	rm -rf ~/.gemini/config/plugins/abc
	ln -s $(realpath $(DIST_DIR)/antigravity-clipboard-bridge) ~/.gemini/config/plugins/abc
	@echo "Plugin symlinked successfully for development!"
