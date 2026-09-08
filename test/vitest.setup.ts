// Guarantee a DATABASE_URL exists before any module constructs the shared
// Prisma client, so unit tests that merely import repositories don't fail.
// Integration tests override this with their own throwaway database.
process.env.DATABASE_URL ??= 'file:./dev.db';
