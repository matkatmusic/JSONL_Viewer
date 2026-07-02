# s1 content-block field value types

## text
- text: string
- type: string

## thinking
- signature: string
- thinking: string
- type: string

## tool_result
- content: string
- is_error: boolean
- tool_use_id: string
- type: string

## tool_use
- caller: object
- id: string
- input: object
- name: string
- type: string

## tool_use.input keys by tool name
- Bash: command, description
- Write: content, file_path

## tool_use.caller samples: {"type":"direct"}
## tool_result.content shapes: string