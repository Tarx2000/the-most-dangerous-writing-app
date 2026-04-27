import { run, getAll, getFirst } from '@/lib/db';
import type { Person } from '@/types';

export interface PersonRow {
    id: string;
    name: string;
    created_at: number;
    nickname: string | null;
    relationship: string | null;
    birthday: string | null;
    bio: string | null;
    custom_relationships: string | null;
}

function rowToPerson(row: PersonRow): Person {
    return {
        id: row.id,
        name: row.name,
        createdAt: row.created_at,
        nickname: row.nickname ?? undefined,
        relationship: row.relationship ?? undefined,
        birthday: row.birthday ?? undefined,
        bio: row.bio ?? undefined,
        customRelationships: row.custom_relationships ? row.custom_relationships.split(',') : undefined,
    };
}

export async function getAllPersons(): Promise<Person[]> {
    const rows = await getAll<PersonRow>(`SELECT * FROM persons ORDER BY created_at DESC`);
    return rows.map(rowToPerson);
}

export async function getPersonById(id: string): Promise<Person | undefined> {
    const row = await getFirst<PersonRow>(`SELECT * FROM persons WHERE id = ?`, [id]);
    return row ? rowToPerson(row) : undefined;
}

export async function insertPerson(person: Person): Promise<void> {
    await run(
        `INSERT INTO persons (id, name, created_at, nickname, relationship, birthday, bio, custom_relationships)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            person.id, person.name, person.createdAt,
            person.nickname ?? null, person.relationship ?? null,
            person.birthday ?? null, person.bio ?? null,
            person.customRelationships?.join(',') ?? null,
        ]
    );
}

export async function updatePerson(id: string, updates: Partial<Person>): Promise<void> {
    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
    if (updates.nickname !== undefined) { fields.push('nickname = ?'); values.push(updates.nickname ?? null); }
    if (updates.relationship !== undefined) { fields.push('relationship = ?'); values.push(updates.relationship ?? null); }
    if (updates.birthday !== undefined) { fields.push('birthday = ?'); values.push(updates.birthday ?? null); }
    if (updates.bio !== undefined) { fields.push('bio = ?'); values.push(updates.bio ?? null); }
    if (updates.customRelationships !== undefined) { fields.push('custom_relationships = ?'); values.push(updates.customRelationships?.join(',') ?? null); }

    if (fields.length === 0) return;
    values.push(id);
    await run(`UPDATE persons SET ${fields.join(', ')} WHERE id = ?`, values);
}

export async function deletePerson(id: string): Promise<void> {
    await run(`DELETE FROM persons WHERE id = ?`, [id]);
    // Also detach from notes
    await run(`UPDATE notes SET person_id = NULL WHERE person_id = ?`, [id]);
}

export async function deleteAllPersons(): Promise<void> {
    await run(`DELETE FROM persons`);
}
