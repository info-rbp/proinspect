-- Run ONLY AFTER OWNER APPROVAL to remove the test Staff Administrator privilege.
-- Does not delete users or interfere with real customer records.
UPDATE staff_profiles SET active=0 WHERE user_id=(SELECT id FROM users WHERE email='staff-testing@proinspect.systems') AND role='administrator';