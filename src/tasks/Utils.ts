
import { globSync } from 'glob'

// Get all files, ignoring the globs in our list
export const getAllFiles = () => globSync('**/*', { ignore: [
    ".env",
    "node_modules/**",
    "dist/**",
    ".claude/**",
    "build/**",
    "package-lock.json"
], nodir: true})
