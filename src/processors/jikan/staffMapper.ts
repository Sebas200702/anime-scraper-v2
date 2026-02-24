import type { StaffProcessorResult } from '../../types/index.js'
import type { Staff } from '../../types/jikanApi.js'

export const mapStaff = (staff: Staff): StaffProcessorResult => {
  return {
    staff: {
      malId: staff.mal_id,
      name: staff.name,
      givenName: staff.given_name,
      familyName: staff.family_name,
      birthday: staff.birthday,
      about: staff.about,
    },
    alternativeNames: (staff.alternate_names || []).map((name) => ({
      staffId: staff.mal_id,
      name,
    })),
  }
}
