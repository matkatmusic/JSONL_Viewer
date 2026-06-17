#!/bin/bash
jq -r '.tool_input.command' | grep -qE '(&&|\|\||;)' && echo 'No compound commands — issue separately' >&2 && exit 2 || exit 0
