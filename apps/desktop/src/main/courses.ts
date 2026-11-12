import { randomUUID } from 'node:crypto'
import type { AppDb } from './db.js'
import type { Course } from '../shared/ipc.js'

export function createCourseService(db: AppDb) {
  const read = (): Course[] => {
    try { const value = JSON.parse(db.getSetting('courses') ?? '[]'); return Array.isArray(value) ? value : [] } catch { return [] }
  }
  const validate = (name: unknown): string => {
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 120) throw new Error('Use a course name of 1–120 characters.')
    return name.trim()
  }
  function list(): Course[] {
    const courses = read()
    for (const note of db.listNotes()) if (note.course && !courses.some((c) => c.name === note.course)) {
      courses.push({ id: `imported:${note.course}`, name: note.course, archived: false, createdAt: 0 })
    }
    return courses.sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name))
  }
  function save(courses: Course[]): void { db.setSetting('courses', JSON.stringify(courses)) }
  return {
    list,
    create(input: string): Course {
      const name = validate(input), courses = list()
      if (courses.some((c) => c.name.toLowerCase() === name.toLowerCase())) throw new Error('This course already exists.')
      const course: Course = { id: randomUUID(), name, archived: false, createdAt: Date.now() }
      save([...courses, course]); return course
    },
    update(id: string, name: string, archived: boolean): Course {
      const nextName = validate(name), courses = list(), course = courses.find((c) => c.id === id)
      if (!course || typeof archived !== 'boolean') throw new Error('Unknown course.')
      if (courses.some((c) => c.id !== id && c.name.toLowerCase() === nextName.toLowerCase())) throw new Error('This course already exists.')
      if (nextName !== course.name) for (const summary of db.listNotes().filter((n) => n.course === course.name)) {
        const note = db.getNote(summary.id)!
        db.saveNote({ ...note, frontMatter: { ...note.frontMatter, course: nextName }, updatedAt: Date.now() })
      }
      Object.assign(course, { name: nextName, archived }); save(courses); return course
    }
  }
}
