export * as schema from './schema.js';
export { openDatabase, MIGRATIONS_DIR } from './open.js';
export type { Db, OpenResult, OpenOptions } from './open.js';
export { SCHEMA_VERSION, DatabaseTooNewError, MigrationFailedError } from './version.js';
export { NotFoundError, FileInUseError, TeacherAlreadyExistsError } from './errors.js';
export { newId } from './ids.js';
export * from './repositories/index.js';
export { LessonWorkspaceError } from './repositories/lesson-workspaces.js';
