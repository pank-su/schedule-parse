CREATE OR REPLACE FUNCTION find_teacher(inicials text)
    RETURNS text
AS
$$
DECLARE
    teacher_id int;
BEGIN
    SELECT id
    into teacher_id
    FROM teacher
    WHERE concat_ws(' ', last_name, concat("left"(first_name, 1), '.', "left"(second_name, 1), '.')) = inicials;
    if (teacher_id is null) then
        teacher_id := (SELECT id FROM teacher ORDER BY id DESC LIMIT 1) + 1;
        INSERT INTO teacher(id, last_name, first_name, second_name)
        VALUES (teacher_id, split_part(inicials, ' ', 1), split_part(split_part(inicials, ' ', 2), '.', 1), split_part(split_part(inicials, ' ', 2), '.', 2));
    end if;
    return teacher_id;
END;
$$
    LANGUAGE plpgsql;


create function get_day_schedule(day_id_ integer, group_id_ integer, is_numerator_ boolean) returns subject_info[]
    security definer
    language plpgsql
as
$$
DECLARE
    subject_i subject_info[];
BEGIN
    SELECT array_agg((time_str, (SELECT CAST((subject_id, subject_name) as subject)
                            FROM subject
                            WHERE subject.id = schedule.subject_id)::subject,
                  (SELECT CAST((teacher.id, last_name, first_name, second_name, email, photo) as teacher)
                   FROM teacher
                   WHERE teacher.id = stc.teacher_id), cabinet_number)::subject_info) INTO subject_i
FROM schedule
         JOIN public.schedule_teacher_cabinet stc on schedule.id = stc.schedule_id
WHERE group_id = group_id_
  AND day_id = day_id_
  AND is_numerator = is_numerator_;
    RETURN subject_i;
end;
$$;
