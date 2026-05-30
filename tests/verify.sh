#!/bin/bash
# Clipboard Compatibility Verifier

# --- Configuration ---
MATRIX_FILE="tests/COMPATIBILITY.md"
HEADLESS_FILE=".headless_token"

show_help() {
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  --clear               Reset the compatibility matrix."
    echo "  --headless            Run in headless mode (writes a unique token to clipboard)."
    echo "  --method=<name>       Target a specific method for headless mode."
    echo "  --validate=<token>    Validate a previously written headless token."
    echo "  --help                Show this help message."
    echo ""
    echo "Methods:"
    echo "  osc52-stdout, osc52-tty, osc52-ssh, osc52-tmux"
    echo "  wsl-clip, wsl-powershell"
    echo "  bypass-file, bypass-pipe"
    echo "  bridge"
}

clear_matrix() {
    echo "Clearing $MATRIX_FILE..."
    cat <<EOF > "$MATRIX_FILE"
# Environment Compatibility Matrix

## Notes
- **Windows Terminal:** Requires OSC 52 enabled in settings.
- **VS Code Terminal:** Requires \`terminal.integrated.allowOsc52\` (or \`terminal.integrated.allowClipboardOperations\`) enabled in settings.
- **TMUX:** May require \`set -s set-clipboard on\` in \`.tmux.conf\`.

Use \`tests/verify.sh\` to populate this matrix.

| User Environment | Agent Environment | Agent Mode | Connection | Method | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
EOF
    echo "Matrix cleared."
}

# --- Argument Parsing ---
for i in "$@"; do
    case $i in
        --clear)
            clear_matrix
            exit 0
            ;;
        --headless)
            RUN_HEADLESS=true
            shift
            ;;
        --method=*)
            TARGET_METHOD="${i#*=}"
            shift
            ;;
        --validate=*)
            VALIDATE_TOKEN="${i#*=}"
            DO_VALIDATE=true
            shift
            ;;
        --help)
            show_help
            exit 0
            ;;
    esac
done

get_method_cmd() {
    local method=$1
    local token=$2
    local b64_token=$(echo -n "$token" | base64)

    case $method in
        osc52-stdout)     echo "printf '\e]52;c;${b64_token}\a'" ;;
        osc52-tty)        echo "printf '\e]52;c;${b64_token}\a' > /dev/tty" ;;
        osc52-ssh)        echo "printf '\e]52;c;${b64_token}\a' > $SSH_TTY" ;;
        osc52-tmux)       echo "printf '\ePtmux;\e\e]52;c;${b64_token}\a\e\\\' > ${SSH_TTY:-/dev/tty}" ;;
        wsl-clip)         echo "echo -n '${token}' | clip.exe" ;;
        wsl-powershell)   echo "echo -n '${token}' | powershell.exe -Command Set-Clipboard" ;;
        bypass-file)      echo "printf '\e]52;c;${b64_token}\a' > .clipboard_bypass" ;;
        bypass-pipe)      echo "printf '\e]52;c;${b64_token}\a' > .clipboard_pipe" ;;
        bridge)           echo "scripts/copy_to_clipboard.sh '${token}'" ;;
        *)                return 1 ;;
    esac
}

if [ "$DO_VALIDATE" = true ]; then
    if [ ! -f "$HEADLESS_FILE" ]; then
        echo "Error: No headless token found in $HEADLESS_FILE. Run --headless first."
        exit 1
    fi
    EXPECTED=$(cat "$HEADLESS_FILE")
    if [ "$VALIDATE_TOKEN" == "$EXPECTED" ]; then
        echo "SUCCESS: Token matches!"
        rm "$HEADLESS_FILE"
        exit 0
    else
        echo "FAILURE: Expected '$EXPECTED', got '$VALIDATE_TOKEN'"
        exit 1
    fi
fi

if [ "$RUN_HEADLESS" = true ]; then
    TOKEN="headless-$(date +%s)"
    METHOD="${TARGET_METHOD:-bridge}"
    CMD=$(get_method_cmd "$METHOD" "$TOKEN")
    
    if [ $? -ne 0 ]; then
        echo "Error: Unknown method '$METHOD'"
        exit 1
    fi

    echo "Headless mode [Method: $METHOD]: Writing '$TOKEN' to clipboard..."
    echo "$TOKEN" > "$HEADLESS_FILE"
    
    # Execute the selected command
    eval "$CMD" 2>/dev/null || eval "$CMD"
    
    echo "Token written using $METHOD. Now run: $0 --validate=<paste_here>"
    exit 0
fi

clear_clipboard() {
    # OSC 52 Clear (Standard)
    if [ -n "$SSH_TTY" ]; then
        printf '\e]52;c;AA==\a' > "$SSH_TTY"
    else
        printf '\e]52;c;AA==\a' > /dev/tty
    fi

    # WSL Fallback
    if grep -qi microsoft /proc/version 2>/dev/null; then
        if command -v clip.exe >/dev/null; then
            echo -n "" | clip.exe
        fi
    fi

    # macOS Fallback
    if [[ "$OSTYPE" == "darwin"* ]] && command -v pbcopy >/dev/null; then
        echo -n "" | pbcopy
    fi
    
    sleep 0.5
}

echo "--- Clipboard Compatibility Tester ---"
echo "Machine: $(hostname)"
echo "OS: $(uname -srm)"
echo "Client: ${CLIENT_OS:-Unknown} / ${CLIENT_TERM:-Unknown}"
if [ -z "$CLIENT_OS" ] || [ -z "$CLIENT_TERM" ]; then
    echo "TIP: Provide metadata for the matrix by setting CLIENT_OS and CLIENT_TERM:"
    echo "     CLIENT_OS=\"Windows\" CLIENT_TERM=\"Windows Terminal\" $0"
fi
echo "TTY: $(tty)"
echo "SSH_TTY: $SSH_TTY"
echo "TERM: $TERM"
echo "-----------------------------------"

# Detection
IS_WSL=false
if grep -qi microsoft /proc/version 2>/dev/null; then IS_WSL=true; fi
IS_MACOS=false
if [[ "$OSTYPE" == "darwin"* ]]; then IS_MACOS=true; fi

# --- State ---
PASS_COUNT=0
FAIL_COUNT=0

test_copy() {
    local category=$1
    local label=$2
    local cmd=$3
    local expected=$4
    local full_label="[$category] $label"
    
    # Ensure matrix file exists with headers before appending
    if [ ! -f "$MATRIX_FILE" ]; then
        clear_matrix
    fi

    echo "Clearing clipboard..."
    clear_clipboard

    echo "Testing $full_label..."
    eval "$cmd"
    
    echo -n "Please PASTE your clipboard content (Ctrl+V/Cmd+V) and press Enter: "
    read -r pasted
    
    if [ "$pasted" == "$expected" ]; then
        status="SUCCESS"
        echo "[$status] Clipboard matches: '$pasted'"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        status="FAILURE"
        echo "[$status] Expected '$expected', but got '$pasted'"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
    
    # --- Logging Logic ---
    local agent_os=$(grep PRETTY_NAME /etc/os-release | cut -d '"' -f 2 || uname -s)
    
    local connection="Local"
    [ -n "$SSH_TTY" ] && connection="SSH"
    
    local multiplexer=""
    [ -n "$TMUX" ] && multiplexer=", tmux"
    
    # Mode detection
    local mode="Outside CLI"
    if [ "$GEMINI_CLI" = "1" ] || [ "$AGENT_CLI" = "1" ]; then
        mode="${AGENT_MODE:-${GEMINI_MODE:-Default}}"
        # Heuristic for sandbox if not explicitly provided
        if [ -z "$AGENT_MODE" ] && [ -z "$GEMINI_MODE" ] && env | grep -qiE "SANDBOX|DOCKER|KUBERNETES"; then
            mode="Sandbox"
        fi
    fi
    
    local user_env="${CLIENT_OS:-Unknown} / ${CLIENT_TERM:-Unknown}"
    local agent_env="${agent_os} (${TERM} on $(tty)${multiplexer})"
    
    printf "| %s | %s | %s | %s | %s | %s |\n" \
        "$user_env" "$agent_env" "$mode" "$connection" "$full_label" "$status" >> tests/COMPATIBILITY.md
}

# --- OSC 52 Category ---
test_copy "OSC 52" "Direct stdout" "printf '\e]52;c;dGVzdC1vc2M1Mi1zdGRvdXQ=\a'" "test-osc52-stdout"
test_copy "OSC 52" "Direct /dev/tty" "printf '\e]52;c;dGVzdC1vc2M1Mi10dHk=\a' > /dev/tty" "test-osc52-tty"

if [ -n "$SSH_TTY" ]; then
    test_copy "OSC 52" "Targeted SSH_TTY ($SSH_TTY)" "printf '\e]52;c;dGVzdC1vc2M1Mi1zc2g=\a' > $SSH_TTY" "test-osc52-ssh"
fi

if [ -n "$TMUX" ]; then
    test_copy "OSC 52" "TMUX Wrapped" "printf '\ePtmux;\e\e]52;c;dGVzdC1vc2M1Mi10bXV4\a\e\\' > ${SSH_TTY:-/dev/tty}" "test-osc52-tmux"
fi

# --- WSL Category ---
if [ "$IS_WSL" = true ]; then
    CLIP_EXE=$(command -v clip.exe || echo "/mnt/c/Windows/System32/clip.exe")
    if [ -f "$CLIP_EXE" ] || command -v clip.exe >/dev/null; then
        test_copy "WSL" "clip.exe pipe" "echo -n 'test-clip-exe' | \"$CLIP_EXE\"" "test-clip-exe"
    fi
    
    POWERSHELL_EXE=$(command -v powershell.exe || echo "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe")
    if [ -f "$POWERSHELL_EXE" ] || command -v powershell.exe >/dev/null; then
        test_copy "WSL" "powershell.exe" "echo -n 'test-powershell' | \"$POWERSHELL_EXE\" -NoProfile -NonInteractive -Command \"Set-Clipboard -Value \\\$Input\"" "test-powershell"
    fi
fi

# --- Windows (Native) Category ---
if [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
    if command -v clip.exe >/dev/null; then
        test_copy "Windows" "clip.exe" "echo -n 'test-native-clip' | clip.exe" "test-native-clip"
    fi
    if command -v powershell.exe >/dev/null; then
        test_copy "Windows" "powershell.exe" "echo -n 'test-native-powershell' | powershell.exe -Command Set-Clipboard" "test-native-powershell"
    fi
fi

# --- macOS Category ---
if [ "$IS_MACOS" = true ]; then
    if command -v pbcopy >/dev/null; then
        test_copy "macOS" "pbcopy" "echo -n 'test-pbcopy' | pbcopy" "test-pbcopy"
    fi
fi

# --- Bypass Category ---
echo "INFO: To test the File Bypass, ensure this is running on your HOST:"
echo "      tail -F .clipboard_bypass > \$(tty)"
test_copy "Bypass" "File (.clipboard_bypass)" "printf '\e]52;c;dGVzdC1maWxlLWJ5cGFzcw==\a' > .clipboard_bypass" "test-file-bypass"

if [ -p ".clipboard_pipe" ]; then
    echo "INFO: To test the Named Pipe Bypass, ensure this is running on your HOST:"
    echo "      while true; do cat .clipboard_pipe; done > \$(tty)"
    test_copy "Bypass" "Named Pipe (.clipboard_pipe)" "printf '\e]52;c;dGVzdC1waXBlLWJ5cGFzcw==\a' > .clipboard_pipe" "test-pipe-bypass"
fi

BRIDGE_SCRIPT="scripts/copy_to_clipboard.sh"
if [ -f "$BRIDGE_SCRIPT" ]; then
    test_copy "Bridge" "copy_to_clipboard.sh wrapper" "$BRIDGE_SCRIPT 'test-bridge-script'" "test-bridge-script"
fi

echo "-----------------------------------"
echo "Verification complete."
echo "Summary: $PASS_COUNT PASSED, $FAIL_COUNT FAILED"
if [ $FAIL_COUNT -eq 0 ]; then
    echo "RESULT: ALL TESTS PASSED ✅"
else
    echo "RESULT: SOME TESTS FAILED ❌"
fi
