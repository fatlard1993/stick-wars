import { GET, POST } from '@vanilla-bean/components';

// The armory's weapons as its page and the borrowing picker show them, and this browser's thumbs on them

// Who's voting: one id kept in this browser, so each person has one thumb a weapon
export const voter = () => {
	try {
		let id = localStorage.getItem('voter');

		if (!id) {
			id = Math.random().toString(36).slice(2, 12);
			localStorage.setItem('voter', id);
		}

		return id;
	} catch {
		return 'nobody';
	}
};

/** The armory's weapons, sorted one of its ways (loved, hated, controversial, deadliest) */
export const weapons = async sort => (await GET('/armory', { apiId: ['armory', sort], invalidateAfter: 0, searchParameters: { sort, voter: voter() } })).body ?? [];

/** A thumb given (1 up, -1 down), or taken back (0): the weapon's thumbs now */
export const vote = async (id, thumb) => (await POST('/armory/:id/vote', { urlParameters: { id }, body: { voter: voter(), thumb } })).body;
