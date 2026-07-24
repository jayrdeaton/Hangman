/* eslint-disable no-console */
import { spawn } from 'child_process'
import fs from 'fs'

type ScraperTask = {
  name: string
  file: string
  requires?: {
    env?: string[]
    files?: string[]
  }
}

const tasks: ScraperTask[] = [
  { name: 'phrases', file: 'scripts/phrases.ts' },
  { name: 'geography', file: 'scripts/geography.ts' },
  { name: 'landmarks', file: 'scripts/geographyLandmarks.ts' },
  { name: 'themes', file: 'scripts/themePacks.ts' },
  {
    name: 'trivia',
    file: 'scripts/trivia.ts',
    requires: { files: ['./JEOPARDY.json'] }
  },
  {
    name: 'trivia-curate',
    file: 'scripts/curateTrivia.ts',
    requires: { files: ['./data/raw/trivia.json'] }
  },
  { name: 'musicbrainz', file: 'scripts/musicbrainz.ts' },
  { name: 'imdb', file: 'scripts/imdb.ts' },
  {
    name: 'lastfm',
    file: 'scripts/lastfm.ts',
    requires: { env: ['LASTFM_API_KEY'] }
  },
  { name: 'catalog', file: 'scripts/buildPuzzleCatalog.ts' }
]

const hasPrerequisites = (task: ScraperTask): { ok: boolean; reason?: string } => {
  for (const envVar of task.requires?.env ?? []) {
    if (!process.env[envVar]) {
      return { ok: false, reason: `missing env ${envVar}` }
    }
  }

  for (const filePath of task.requires?.files ?? []) {
    if (!fs.existsSync(filePath)) {
      return { ok: false, reason: `missing file ${filePath}` }
    }
  }

  return { ok: true }
}

const runTask = async (task: ScraperTask) => {
  console.log(`\n==> running ${task.name} (${task.file})`)

  await new Promise<void>((resolve, reject) => {
    const child = spawn('tsx', [task.file], {
      stdio: 'inherit',
      env: process.env
    })

    child.on('error', reject)

    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`${task.name} failed with exit code ${code}`))
      }
    })
  })
}

async function main() {
  const skipped: string[] = []
  const failed: string[] = []
  const passed: string[] = []

  for (const task of tasks) {
    const check = hasPrerequisites(task)

    if (!check.ok) {
      console.log(`\n==> skipping ${task.name}: ${check.reason}`)
      skipped.push(task.name)
      continue
    }

    try {
      await runTask(task)
      passed.push(task.name)
    } catch (error) {
      failed.push(task.name)
      console.error(error)
    }
  }

  console.log('\n==> scraper summary')
  console.log(`passed: ${passed.length}${passed.length ? ` (${passed.join(', ')})` : ''}`)
  console.log(`skipped: ${skipped.length}${skipped.length ? ` (${skipped.join(', ')})` : ''}`)
  console.log(`failed: ${failed.length}${failed.length ? ` (${failed.join(', ')})` : ''}`)

  if (failed.length > 0) {
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
