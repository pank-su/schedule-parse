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