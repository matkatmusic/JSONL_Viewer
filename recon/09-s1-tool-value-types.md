# s1 tool input/result value types

## Bash input
- command: string
- description: string
## Bash toolUseResult
- interrupted: boolean
- isImage: boolean
- noOutputExpected: boolean
- stderr: string
- stdout: string

## Write input
- content: string
- file_path: string
## Write toolUseResult
- content: string
- filePath: string
- originalFile: null
- structuredPatch: array(0)
- type: string
- userModified: boolean

Write result `type` values: create